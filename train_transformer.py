"""训练 FirstMind Transformer 并保存模型。"""

from pathlib import Path

import torch
import torch.nn as nn

from firstmind_data import load_training_data
from firstmind_model import FirstMindTransformer


# 项目目录与模型保存位置
PROJECT_DIR = Path(__file__).resolve().parent

MODEL_PATH = PROJECT_DIR / "firstmind_transformer.pth"

EPOCHS = 100
LEARNING_RATE = 0.001


def main():

    # 1. 如果已经有模型，就不重复训练
    if MODEL_PATH.exists():
        print(f"已存在训练好的模型：{MODEL_PATH}")
        print("已跳过训练，原有模型不会被覆盖。")
        return

    # 固定随机种子，方便复现实验
    torch.manual_seed(42)

    # 2. 加载训练数据
    data = load_training_data(
        sequence_file=str(PROJECT_DIR / "behavior-sequences.json"),
        label_file=str(PROJECT_DIR / "behavior-labels.json"),
    )

    features = data["features"]
    padding_mask = data["padding_mask"]
    labels = data["labels"]
    label_to_id = data["label_to_id"]

    print("训练特征形状：", features.shape)
    print("Mask 形状：", padding_mask.shape)
    print("人工标签形状：", labels.shape)

    # 3. 创建 Transformer 模型
    model = FirstMindTransformer(
        input_dim=features.shape[-1],
        model_dim=64,
        sequence_length=features.shape[1],
        num_classes=len(label_to_id),
    )

    # 损失函数
    criterion = nn.CrossEntropyLoss()

    # 优化器
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=LEARNING_RATE
    )

    # 4. 正式训练
    print("\n========== 开始训练 ==========")

    for epoch in range(1, EPOCHS + 1):

        model.train()

        # 清除旧梯度
        optimizer.zero_grad()

        # 前向传播
        logits = model(
            features,
            padding_mask
        )

        # 计算损失
        loss = criterion(
            logits,
            labels
        )

        # 反向传播
        loss.backward()

        # 更新模型参数
        optimizer.step()

        if epoch == 1 or epoch % 10 == 0:
            print(
                f"Epoch {epoch}/{EPOCHS} "
                f"Loss = {loss.item():.4f}"
            )

    # 5. 检查训练集准确率
    model.eval()

    with torch.no_grad():

        final_logits = model(
            features,
            padding_mask
        )

        predictions = final_logits.argmax(dim=1)

        correct = (
            predictions == labels
        ).sum().item()

        train_accuracy = correct / len(labels)

    print(f"训练样本正确：{correct}/{len(labels)}")

    print(
        f"训练集准确率：{train_accuracy:.2%}"
        "（不是验证集准确率）"
    )

    # 6. 保存模型与归一化参数
    checkpoint = {
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),

        "model_config": {
            "input_dim": features.shape[-1],
            "model_dim": 64,
            "sequence_length": features.shape[1],
            "num_classes": len(label_to_id),
        },

        "feature_mean": data["feature_mean"].detach().cpu(),
        "safe_std": data["safe_std"].detach().cpu(),

        "feature_names": data["feature_names"],
        "label_to_id": label_to_id,

        "epochs": EPOCHS,
        "train_accuracy": train_accuracy,
    }

    torch.save(checkpoint, MODEL_PATH)

    print(f"\n模型已保存：{MODEL_PATH}")


if __name__ == "__main__":
    main()