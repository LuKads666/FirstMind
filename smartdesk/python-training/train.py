# -*- coding: utf-8 -*-
"""
行为模型训练 + ONNX 导出（设计文档 11.3/11.5）

用法：
  python train.py --db <smartdesk.db> [--epochs 3] [--max-windows 8000]

产出（resources/onnx/）：
  behavior_model.onnx / feature_config.json / category_map.json / model_card.json
"""
import argparse
import json
import os
import sys
import time

import numpy as np
import torch
from sklearn.metrics import f1_score, roc_auc_score  # type: ignore

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from features import (  # noqa: E402
    CATEGORY_LIST,
    NUM_FEATURES,
    SEQ_LEN,
    build_windows,
    split_by_day,
)
from model import BehaviorTransformer, count_parameters  # noqa: E402


def macro_f1(y_true, y_pred):
    return float(f1_score(y_true, y_pred, average="macro"))


def evaluate(model, tensors, device):
    Xn, Xc, ya, yd, ydur = tensors
    model.eval()
    acts, diss = [], []
    with torch.no_grad():
        for i in range(0, len(Xn), 256):
            num = torch.from_numpy(Xn[i : i + 256]).to(device)
            cat = torch.from_numpy(Xc[i : i + 256]).to(device)
            out = model(num, cat)
            acts.append(out["activity_logits"].cpu())
            diss.append(out["distraction_prob"].cpu())
    act_logits = torch.cat(acts).numpy()
    dis_prob = torch.cat(diss).numpy().reshape(-1)

    act_pred = act_logits.argmax(axis=1)
    baseline_pred = np.zeros_like(ya)  # 规则基线：永远预测 unknown(8)
    baseline_pred[:] = CATEGORY_LIST.index("unknown")

    result = {
        "activity_macro_f1": macro_f1(ya, act_pred),
        "baseline_macro_f1": macro_f1(ya, baseline_pred),
    }
    try:
        result["distraction_auc"] = float(roc_auc_score(yd, dis_prob))
    except ValueError:
        result["distraction_auc"] = None

    # 分心基线：全预测 0；时长头 MAE（分钟）
    result["distraction_baseline_acc"] = float(1.0 - np.mean(yd))
    result["distraction_acc"] = float(np.mean((dis_prob > 0.5).astype(float) == yd))
    result["duration_mae_minutes"] = float(np.mean(np.abs(ydur - dis_prob))) * 120
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--max-windows", type=int, default=8000)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--outdir", default=os.path.join("..", "resources", "onnx"))
    args = ap.parse_args()

    import sqlite3

    conn = sqlite3.connect(args.db)
    data = build_windows(conn, stride=3, max_windows=args.max_windows, rng=np.random.default_rng(42))
    conn.close()
    if data is None:
        print("数据不足，无法构建训练窗口")
        sys.exit(1)

    (Xn_tr, Xc_tr, ya_tr, yd_tr, ydur_tr), (Xn_te, Xc_te, ya_te, yd_te, ydur_te) = split_by_day(*data)
    print(f"windows train={len(Xn_tr)} test={len(Xn_te)}")

    device = "cpu"
    model = BehaviorTransformer()
    print(f"parameters={count_parameters(model):,}")

    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
    ce = torch.nn.CrossEntropyLoss()
    bce = torch.nn.BCEWithLogitsLoss()
    mse = torch.nn.MSELoss()

    Xn_t = torch.from_numpy(Xn_tr)
    Xc_t = torch.from_numpy(Xc_tr)
    ya_t = torch.from_numpy(ya_tr)
    yd_t = torch.from_numpy(yd_tr)
    ydur_t = torch.from_numpy(ydur_tr)

    steps_per_epoch = int(np.ceil(len(Xn_t) / args.batch))
    start = time.time()
    for epoch in range(args.epochs):
        model.train()
        perm = torch.randperm(len(Xn_t))
        total, n = 0.0, 0
        for s in range(0, len(Xn_t), args.batch):
            idx = perm[s : s + args.batch]
            num, cat = Xn_t[idx], Xc_t[idx]
            out = model(num, cat)
            loss = (
                ce(out["activity_logits"], ya_t[idx])
                + bce(out["distraction_prob"].reshape(-1), yd_t[idx])
                + mse(out["duration_pred"].reshape(-1), ydur_t[idx])
            )
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += float(loss)
            n += 1
        print(f"epoch {epoch + 1}/{args.epochs} loss={total / max(1, n):.4f} elapsed={time.time() - start:.0f}s")

    metrics = evaluate(model, (Xn_te, Xc_te, ya_te, yd_te, ydur_te), device)
    print("metrics:", json.dumps(metrics, ensure_ascii=False))

    # ── 导出 ONNX ──
    os.makedirs(args.outdir, exist_ok=True)
    onnx_path = os.path.join(args.outdir, "behavior_model.onnx")
    model.eval()
    dummy_num = torch.zeros((1, SEQ_LEN, NUM_FEATURES), dtype=torch.float32)
    dummy_cat = torch.zeros((1, SEQ_LEN), dtype=torch.int64)
    torch.onnx.export(
        model,
        (dummy_num, dummy_cat),
        onnx_path,
        input_names=["x_num", "x_cat"],
        output_names=["activity_logits", "distraction_prob", "duration_pred"],
        dynamic_axes={
            "x_num": {0: "batch"},
            "x_cat": {0: "batch"},
            "activity_logits": {0: "batch"},
            "distraction_prob": {0: "batch"},
            "duration_pred": {0: "batch"},
        },
        opset_version=17,
    )

    with open(os.path.join(args.outdir, "feature_config.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "seq_len": SEQ_LEN,
                "num_features": NUM_FEATURES,
                "num_feature_order": [
                    "hour_sin",
                    "hour_cos",
                    "is_weekend",
                    "input_active",
                    "idle_norm",
                    "is_locked",
                    "file_events",
                ],
                "notes": "hour 为小时+分钟/24 的 sin/cos 编码; idle_norm = min(idle_seconds,1800)/1800",
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    with open(os.path.join(args.outdir, "category_map.json"), "w", encoding="utf-8") as f:
        json.dump({"categories": CATEGORY_LIST}, f, ensure_ascii=False, indent=2)

    with open(os.path.join(args.outdir, "model_card.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "name": "behavior_model",
                "version": "0.1.0",
                "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "data_source": os.path.abspath(args.db),
                "train_windows": int(len(Xn_tr)),
                "test_windows": int(len(Xn_te)),
                "parameters": count_parameters(model),
                "metrics": metrics,
                "baseline": "活动分类对比『永远预测 unknown』; 分心对比『全预测 0』",
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print("exported:", os.path.abspath(onnx_path))


if __name__ == "__main__":
    main()
