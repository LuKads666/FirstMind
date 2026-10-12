from pathlib import Path
import json
from datetime import datetime
import torch
from firstmind_model import FirstMindTransformer

# 找到模型文件
PROJECT_DIR = Path(__file__).resolve().parent
MODEL_PATH = PROJECT_DIR / "firstmind_transformer.pth"

# 读取训练时保存的检查点
checkpoint = torch.load(
    MODEL_PATH,
    map_location="cpu",
    weights_only=True
)

# 查看保存的模型配置
print("模型配置：", checkpoint["model_config"])
print("标签映射：", checkpoint["label_to_id"])

# 读取模型配置
config = checkpoint["model_config"]

# 创建与训练时结构一致的 Transformer
model = FirstMindTransformer(
    input_dim=config["input_dim"],
    model_dim=config["model_dim"],
    sequence_length=config["sequence_length"],
    num_classes=config["num_classes"]
)

# 恢复训练100轮后的权重
model.load_state_dict(checkpoint["model_state_dict"])

# 切换到评估模式
model.eval()

print("模型权重恢复成功！")

# ====== 新行为预测（追加在文件最后）======
SEQUENCE_PATH = PROJECT_DIR / "behavior-sequences.json"
LABEL_PATH = PROJECT_DIR / "behavior-labels.json"

with SEQUENCE_PATH.open("r", encoding="utf-8") as f:
    behavior_data = json.load(f)

# 推理的16维特征必须与训练时顺序完全相同
if behavior_data["feature_names"] != checkpoint["feature_names"]:
    raise ValueError("16维特征的名称或顺序与训练时不同，不能直接预测！")

sequences = behavior_data["sequences"]
all_metadata = behavior_data["sequence_metadata"]
if len(sequences) != len(all_metadata):
    raise ValueError("行为序列与时间元数据数量不一致！")

# 找到时间最新的连续行为序列，而不是直接取文件最后一条
candidates = []
for sequence, metadata in zip(sequences, all_metadata):
    if len(sequence) != len(metadata):
        raise ValueError("某条序列的数据与时间元数据长度不一致！")
    if metadata:
        candidates.append((sequence, metadata))

if not candidates:
    raise ValueError("没有可用的行为数据，请先运行 feature-builder.js！")

latest_sequence, latest_metadata = max(
    candidates, key=lambda pair: pair[1][-1]["window_end_ms"]
)
needed = config["sequence_length"]
if len(latest_sequence) < needed:
    print(f"最新连续行为只有 {len(latest_sequence)} 个窗口，不足 {needed} 个，暂不能预测。")
    raise SystemExit(0)

# 只截取最新的6个五分钟窗口
sample = latest_sequence[-needed:]
metadata = latest_metadata[-needed:]
if any(len(window) != config["input_dim"] for window in sample):
    raise ValueError("行为特征维度与模型输入维度不一致！")
if any(a["window_end_ms"] != b["window_start_ms"]
       for a, b in zip(metadata, metadata[1:])):
    raise ValueError("最新的6个窗口时间不连续，请检查数据！")

# 避免误把旧训练样本当成新数据来验证
with LABEL_PATH.open("r", encoding="utf-8") as f:
    labeled_samples = json.load(f)
participant = metadata[0]["participant_id"]
start_ms = metadata[0]["window_start_ms"]
end_ms = metadata[-1]["window_end_ms"]
for sample_id in labeled_samples:
    try:
        old_person, old_start, old_end = sample_id.rsplit("_", 2)
        old_start, old_end = int(old_start), int(old_end)
    except (ValueError, TypeError):
        continue
    if old_person == participant and start_ms < old_end and old_start < end_ms:
        print("最新的30分钟仍与已标注的训练数据重叠，暂不当作新数据预测。")
        print("请先继续采集新数据，再更新行为特征文件。")
        raise SystemExit(0)

# 一份样本：[6,16] -> [1,6,16]
features = torch.tensor([sample], dtype=torch.float32)
# 完整6个窗口，均为真实窗口，因此全部不是Padding
padding_mask = torch.zeros((1, needed), dtype=torch.bool)

# 只能使用训练时保存的均值和标准差
features = (features - checkpoint["feature_mean"]) / checkpoint["safe_std"]

with torch.no_grad():
    logits = model(features, padding_mask)
    probability = torch.softmax(logits, dim=1)[0]
    predicted_id = int(probability.argmax().item())

id_to_label = {number: name for name, number in checkpoint["label_to_id"].items()}
start_time = datetime.fromtimestamp(start_ms / 1000).strftime("%m-%d %H:%M")
end_time = datetime.fromtimestamp(end_ms / 1000).strftime("%m-%d %H:%M")
print(f"行为时间：{start_time} ～ {end_time}")
print("模型预测：", id_to_label[predicted_id])
print(f"模型输出的最高类别概率：{probability[predicted_id].item():.1%}（不等于实际正确率）")
