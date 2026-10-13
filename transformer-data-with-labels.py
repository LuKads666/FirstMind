import json
import torch
import sqlite3
import torch.nn as nn
from datetime import datetime


with open(
    "behavior-sequences.json",
    "r",
    encoding="utf-8"
) as file:

    data = json.load(file)


feature_count = data["feature_count"]

feature_names = data["feature_names"]

sequences = data["sequences"]

sequence_metadata = data["sequence_metadata"]

print(
    "时间序列数量：",
    len(sequence_metadata)
)

print(
    "特征数量：",
    feature_count
)

print(
    "特征名称：",
    feature_names
)

print(
    "行为序列数量：",
    len(sequences)
)


for i, sequence in enumerate(
    sequences,
    start=1
):

    print(
        f"序列 {i}："
        f"{len(sequence)} 个窗口"
    )

    for j, window in enumerate(
        sequence,
        start=1
    ):

        if len(window) != feature_count:

            raise ValueError(
                f"序列 {i} 的第 {j} 个窗口"
                f"不是 {feature_count} 维"
            )


print(
    "所有行为窗口维度检查通过。"
)

longest_sequence = max(sequences, key=len)

tensor = torch.tensor(
    longest_sequence,
    dtype=torch.float32
)

print(
    "最长序列窗口数：",
    len(longest_sequence)
)

print(
    "Tensor shape：",
    tensor.shape
)

print(
    "Tensor dtype：",
    tensor.dtype
)

SEQUENCE_LENGTH = 6
MIN_REAL_WINDOWS = 3

sliced_sequences = []
sliced_metadata = []
sample_masks = []


for i in range(len(sequences)):

    sequence = sequences[i]
    metadata_sequence = sequence_metadata[i]


    # 先切所有完整的 6 窗口样本
    for start in range(
        0,
        len(sequence) - SEQUENCE_LENGTH + 1,
        SEQUENCE_LENGTH
    ):

        end = start + SEQUENCE_LENGTH

        sliced_sequence = sequence[start:end]

        sliced_metadata_sequence = (
            metadata_sequence[start:end]
        )

        sliced_sequences.append(
            sliced_sequence
        )

        sliced_metadata.append(
            sliced_metadata_sequence
        )

        sample_masks.append(
            [1] * SEQUENCE_LENGTH
        )


    # 找当前 sequence 最后剩下的窗口
    remainder_start = (
        len(sequence) // SEQUENCE_LENGTH
    ) * SEQUENCE_LENGTH

    remainder = sequence[remainder_start:]

    remainder_metadata = (
        metadata_sequence[remainder_start:]
    )


    # 剩余 3～5 个窗口时，进行 Padding
    if (
        MIN_REAL_WINDOWS
        <= len(remainder)
        < SEQUENCE_LENGTH
    ):

        padding_count = (
            SEQUENCE_LENGTH
            - len(remainder)
        )

        padding_window = (
            [0.0] * feature_count
        )

        padding_windows = [
            padding_window.copy()
            for _ in range(padding_count)
        ]

        padded_sequence = (
            remainder
            + padding_windows
        )

        mask = (
            [1] * len(remainder)
            +
            [0] * padding_count
        )

        sliced_sequences.append(
            padded_sequence
        )

        sliced_metadata.append(
            remainder_metadata
        )

        sample_masks.append(
            mask
        )


print(
    "最终行为样本数量：",
    len(sliced_sequences)
)

print(
    "最终时间样本数量：",
    len(sliced_metadata)
)

print(
    "最终 Mask 数量：",
    len(sample_masks)
)


for i in range(len(sliced_sequences)):

    real_window_count = sum(
        sample_masks[i]
    )

    print(
        f"样本 {i + 1}：",
        len(sliced_sequences[i]),
        "个位置，Mask =",
        sample_masks[i],
        "真实时间记录 =",
        len(sliced_metadata[i])
    )

    if len(sliced_sequences[i]) != SEQUENCE_LENGTH:
        raise ValueError(
            f"样本 {i + 1} 没有被补到 "
            f"{SEQUENCE_LENGTH} 个窗口"
        )

    if len(sample_masks[i]) != SEQUENCE_LENGTH:
        raise ValueError(
            f"样本 {i + 1} 的 Mask 长度错误"
        )

    if real_window_count != len(sliced_metadata[i]):
        raise ValueError(
            f"样本 {i + 1} 的真实窗口数量"
            f"和时间数量不一致"
        )


print("Padding、Mask 和时间数据检查通过。")

features_tensor = torch.tensor(
    sliced_sequences,
    dtype=torch.float32
)

real_mask_tensor = torch.tensor(
    sample_masks,
    dtype=torch.bool
)

padding_mask_tensor = ~real_mask_tensor


print(
    "Features Tensor shape：",
    features_tensor.shape
)

print(
    "Real Mask Tensor shape：",
    real_mask_tensor.shape
)

print(
    "Padding Mask Tensor shape：",
    padding_mask_tensor.shape
)

# 只取真实窗口，排除 Padding
real_features = features_tensor[
    real_mask_tensor
]

print(
    "真实窗口 Tensor shape：",
    real_features.shape
)


# 分别计算 16 个特征的平均值
feature_mean = real_features.mean(
    dim=0
)

# 分别计算 16 个特征的标准差
feature_std = real_features.std(
    dim=0
)


# 输出每一维的平均值和标准差
print("\n各特征平均值和标准差：")

for i in range(feature_count):
    print(
        f"{feature_names[i]}：",
        "mean =",
        feature_mean[i].item(),
        "std =",
        feature_std[i].item()
    )


# 防止标准差为 0 或非常接近 0
safe_std = torch.where(
    feature_std < 1e-6,
    torch.ones_like(feature_std),
    feature_std
)


# 复制原始 Tensor
normalized_features = (
    features_tensor.clone()
)


# 只对真实窗口进行归一化
normalized_features[
    real_mask_tensor
] = (
    real_features - feature_mean
) / safe_std


print(
    "\nMean shape：",
    feature_mean.shape
)

print(
    "Std shape：",
    feature_std.shape
)

print(
    "归一化后 Tensor shape：",
    normalized_features.shape
)

padding_values = normalized_features[
    padding_mask_tensor
]

print(
    "Padding 最大绝对值：",
    padding_values.abs().max().item()
)

print("\n第 1 个样本归一化后的数据：")

print(
    normalized_features[0]
)

LABEL_FILE = "behavior-labels.json"

try:
    with open(
        LABEL_FILE,
        "r",
        encoding="utf-8"
    ) as file:
        saved_labels = json.load(file)

except FileNotFoundError:
    saved_labels = {}

# ==========================================
# 检查当前样本和旧标签是否还能对应
# ==========================================

current_sample_ids = []


for metadata in sliced_metadata:

    if not metadata:
        continue


    participant_id = (
        metadata[0]["participant_id"]
    )

    start_ms = (
        metadata[0]["window_start_ms"]
    )

    end_ms = (
        metadata[-1]["window_end_ms"]
    )


    sample_id = (
        f"{participant_id}_"
        f"{start_ms}_"
        f"{end_ms}"
    )


    current_sample_ids.append(
        sample_id
    )


current_sample_id_set = set(
    current_sample_ids
)


matched_ids = [
    sample_id
    for sample_id in current_sample_ids
    if sample_id in saved_labels
]


missing_ids = [
    sample_id
    for sample_id in current_sample_ids
    if sample_id not in saved_labels
]


old_only_ids = [
    sample_id
    for sample_id in saved_labels
    if sample_id not in current_sample_id_set
]


print(
    "\n========== 标签对应检查 =========="
)

print(
    "当前 Transformer 样本数：",
    len(current_sample_ids)
)

print(
    "标签文件中的标签数：",
    len(saved_labels)
)

print(
    "成功匹配标签数：",
    len(matched_ids)
)

print(
    "当前样本缺少标签数：",
    len(missing_ids)
)

print(
    "旧标签找不到当前样本数：",
    len(old_only_ids)
)

# ==========================================
# 把文字标签转换成数字标签
# ==========================================

label_to_id = {
    "focused_work": 0,
    "mixed_activity": 1,
    "entertainment": 2
}


label_names = []

for sample_id in current_sample_ids:

    label_name = saved_labels[sample_id]

    label_names.append(
        label_name
    )


label_ids = [
    label_to_id[label_name]
    for label_name in label_names
]


labels_tensor = torch.tensor(
    label_ids,
    dtype=torch.long
)


print(
    "\n========== labels_tensor 检查 =========="
)

print(
    "文字标签：",
    label_names
)

print(
    "数字标签：",
    labels_tensor
)

print(
    "labels_tensor shape：",
    labels_tensor.shape
)

print(
    "features 样本数：",
    features_tensor.shape[0]
)

print(
    "mask 样本数：",
    padding_mask_tensor.shape[0]
)

print(
    "label 样本数：",
    labels_tensor.shape[0]
)

# ==========================================
# Transformer 第一步：16维 → 64维
# ==========================================

INPUT_DIM = 16
MODEL_DIM = 64


input_projection = nn.Linear(
    INPUT_DIM,
    MODEL_DIM
)


projected_features = input_projection(
    normalized_features
)


print(
    "\n========== Linear 16 → 64 检查 =========="
)

print(
    "Linear 前：",
    normalized_features.shape
)

print(
    "Linear 后：",
    projected_features.shape
)

# ==========================================
# Transformer 第二步：加入位置向量
# ==========================================

position_embedding = nn.Embedding(
    SEQUENCE_LENGTH,
    MODEL_DIM
)

# 生成位置编号：0 1 2 3 4 5
position_ids = torch.arange(
    SEQUENCE_LENGTH
)

# 每个位置取出一组 64 维的位置向量
position_features = position_embedding(
    position_ids
)

# 内容向量 + 位置向量
features_with_position = (
    projected_features
    + position_features
)

print("\n========== 位置向量检查 ==========")

print(
    "位置编号：",
    position_ids
)

print(
    "位置向量 shape：",
    position_features.shape
)

print(
    "加位置前：",
    projected_features.shape
)

print(
    "加位置后：",
    features_with_position.shape
)

# ==========================================
# Transformer 第三步：Self-Attention
# ==========================================

encoder_layer = nn.TransformerEncoderLayer(
    d_model=MODEL_DIM,       # 每个时间片是 64 维
    nhead=4,                 # 4 个注意力头
    dim_feedforward=128,
    dropout=0.1,
    batch_first=True
)

transformer_output = encoder_layer(
    features_with_position,
    src_key_padding_mask=padding_mask_tensor
)

print("\n========== Transformer 检查 ==========")

print(
    "进入 Transformer 前：",
    features_with_position.shape
)

print(
    "经过 Transformer 后：",
    transformer_output.shape
)

# ==========================================
# Transformer 第四步：汇总整个时间段
# ==========================================

# padding_mask_tensor:
# False = 真实时间片
# True  = Padding

real_mask = ~padding_mask_tensor

# [22, 6] → [22, 6, 1]
real_mask_float = (
    real_mask
    .unsqueeze(-1)
    .float()
)

# 只把真实时间片留下
masked_output = (
    transformer_output
    * real_mask_float
)

# 把6个时间片相加
summed_output = masked_output.sum(
    dim=1
)

# 计算每个样本实际有几个真实时间片
real_counts = real_mask_float.sum(
    dim=1
).clamp(min=1.0)

# 求平均
pooled_output = (
    summed_output
    / real_counts
)

print(
    "\n========== Pooling 检查 =========="
)

print(
    "Transformer 输出：",
    transformer_output.shape
)

print(
    "Pooling 后：",
    pooled_output.shape
)

# ==========================================
# Transformer 第五步：64维 → 3个类别
# ==========================================

NUM_CLASSES = len(label_to_id)

classifier = nn.Linear(
    MODEL_DIM,
    NUM_CLASSES
)

logits = classifier(
    pooled_output
)

print("\n========== 分类器检查 ==========")

print(
    "分类前：",
    pooled_output.shape
)

print(
    "分类后：",
    logits.shape
)

print(
    "第1个样本的3个分类分数：",
    logits[0]
)

# ==========================================
# Transformer 第六步：计算损失 Loss
# ==========================================

# 创建交叉熵损失函数
criterion = nn.CrossEntropyLoss()

# 模型预测结果与人工标签进行比较
loss = criterion(
    logits,
    labels_tensor
)

print("\n========== Loss 检查 ==========")

print(
    "预测分数 shape：",
    logits.shape
)

print(
    "真实标签 shape：",
    labels_tensor.shape
)

print(
    "当前 Loss：",
    loss.item()
)

# ==========================================
# Transformer 第七步：反向传播
# ==========================================

loss.backward()

print("\n========== 反向传播检查 ==========")

print(
    "输入 Linear 是否得到梯度：",
    input_projection.weight.grad is not None
)

print(
    "位置向量是否得到梯度：",
    position_embedding.weight.grad is not None
)

print(
    "QKV 是否得到梯度：",
    encoder_layer.self_attn.in_proj_weight.grad is not None
)

print(
    "分类器是否得到梯度：",
    classifier.weight.grad is not None
)

# ==========================================
# Transformer 第八步：封装完整模型
# ==========================================

class FirstMindTransformer(nn.Module):

    def __init__(self):
        super().__init__()

        # 1. 16维 → 64维
        self.input_projection = nn.Linear(
            INPUT_DIM,
            MODEL_DIM
        )

        # 2. 位置向量
        self.position_embedding = nn.Embedding(
            SEQUENCE_LENGTH,
            MODEL_DIM
        )

        # 3. Transformer：4头自注意力
        self.encoder = nn.TransformerEncoderLayer(
            d_model=MODEL_DIM,
            nhead=4,
            dim_feedforward=128,
            dropout=0.1,
            batch_first=True
        )

        # 4. 分类器：64维 → 类别数
        self.classifier = nn.Linear(
            MODEL_DIM,
            NUM_CLASSES
        )

    def forward(self, features, padding_mask):

        # 16 → 64
        x = self.input_projection(features)

        # 加入位置向量
        position_ids = torch.arange(
            x.shape[1],
            device=x.device
        )

        x = x + self.position_embedding(
            position_ids
        )

        # 多头自注意力
        x = self.encoder(
            x,
            src_key_padding_mask=padding_mask
        )

        # Masked Mean Pooling
        real_mask = (~padding_mask).unsqueeze(-1).float()

        summed = (x * real_mask).sum(dim=1)

        counts = real_mask.sum(dim=1).clamp(min=1.0)

        pooled = summed / counts

        # 输出三个分类分数
        logits = self.classifier(pooled)

        return logits


# 创建完整模型
model = FirstMindTransformer()

# 测试完整模型
model_logits = model(
    normalized_features,
    padding_mask_tensor
)

print("\n========== 完整模型检查 ==========")

print("输入 shape：", normalized_features.shape)
print("输出 shape：", model_logits.shape)

# ==========================================
# Transformer 第九步：完整训练循环
# ==========================================

# 创建优化器
optimizer = torch.optim.Adam(
    model.parameters(),
    lr=0.001
)

# 创建损失函数
train_criterion = nn.CrossEntropyLoss()

# 训练100轮
EPOCHS = 100

print("\n========== Transformer 开始训练 ==========")

for epoch in range(1, EPOCHS + 1):

    # 进入训练模式
    model.train()

    # 清除上一轮的梯度
    optimizer.zero_grad()

    # 模型预测
    train_logits = model(
        normalized_features,
        padding_mask_tensor
    )

    # 计算损失
    train_loss = train_criterion(
        train_logits,
        labels_tensor
    )

    # 反向传播
    train_loss.backward()

    # 更新模型参数
    optimizer.step()

    # 每10轮打印一次损失
    if epoch == 1 or epoch % 10 == 0:
        print(
            f"Epoch {epoch}/{EPOCHS} "
            f"Loss = {train_loss.item():.4f}"
        )

db = sqlite3.connect("campus.db")

print("\n========== 样本标签辅助信息 ==========")

for sample_index in range(len(sliced_metadata)):

    metadata = sliced_metadata[sample_index]

    if len(metadata) == 0:
        continue

    start_ms = metadata[0]["window_start_ms"]
    end_ms = metadata[-1]["window_end_ms"]

    participant_id = metadata[0][
    "participant_id"
   ]

    sample_id = (
    f"{participant_id}_"
    f"{start_ms}_"
    f"{end_ms}"
    )

    start_time = datetime.fromtimestamp(
        start_ms / 1000
    )

    end_time = datetime.fromtimestamp(
        end_ms / 1000
    )

    app_totals = {}

    for window_metadata in metadata:

        row = db.execute(
            """
            SELECT app_durations_json
            FROM behavior_windows
            WHERE participant_id = ?
              AND window_start_ms = ?
            """,
            (
                window_metadata["participant_id"],
                window_metadata["window_start_ms"]
            )
        ).fetchone()

        if row is None:
            continue

        app_durations = json.loads(
            row[0]
        )

        for app_name, duration in app_durations.items():

            app_totals[app_name] = (
                app_totals.get(app_name, 0)
                + duration
            )

    top_apps = sorted(
        app_totals.items(),
        key=lambda item: item[1],
        reverse=True
    )[:5]

    print(
        f"\n样本 {sample_index + 1}"
    )

    print(
        "时间：",
        start_time.strftime("%Y-%m-%d %H:%M"),
        "～",
        end_time.strftime("%H:%M")
    )

    print(
        "真实窗口数：",
        len(metadata)
    )

    print("主要软件：")

    for app_name, duration in top_apps:
        print(
            "  ",
            app_name,
            "累计值：",
            round(duration, 2)
        )

    # 如果这个样本以前已经标过，就直接显示旧标签并进入下一个样本
    if sample_id in saved_labels:
        print(
            "已有标签：",
            saved_labels[sample_id]
        )
        continue

    print(
        """
请选择标签：

1 = focused_work
2 = mixed_activity
3 = entertainment
s = skip
q = 退出
"""
    )

    choice = input(
        "你的选择："
    ).strip().lower()

    label_map = {
        "1": "focused_work",
        "2": "mixed_activity",
        "3": "entertainment"
    }

    if choice == "q":
        break

    if choice == "s":
        print("已跳过这个样本。")
        continue

    if choice not in label_map:
        print(
            "无效输入，本样本跳过。"
        )
        continue

    saved_labels[sample_id] = (
        label_map[choice]
    )

    # 每标完一个样本就立刻保存，避免中途退出后标签丢失
    with open(
        LABEL_FILE,
        "w",
        encoding="utf-8"
    ) as file:
        json.dump(
            saved_labels,
            file,
            ensure_ascii=False,
            indent=2
        )

    print(
        "已保存：",
        saved_labels[sample_id]
    )

db.close()

label_counts = {}

for label in saved_labels.values():

    label_counts[label] = (
        label_counts.get(label, 0)
        + 1
    )


print("\n========== 标签统计 ==========")

print(
    "已标记样本总数：",
    len(saved_labels)
)

for label, count in label_counts.items():

    print(
        label,
        "：",
        count
    )