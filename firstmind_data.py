"""FirstMind Transformer training-data preparation (no training on import)."""

import json
import torch

SEQUENCE_LENGTH = 6
MIN_REAL_WINDOWS = 3

LABEL_TO_ID = {
    "focused_work": 0,
    "mixed_activity": 1,
    "entertainment": 2,
}


def load_training_data(
    sequence_file="behavior-sequences.json",
    label_file="behavior-labels.json",
):
    """Load and normalize labeled samples using the original slicing rules."""
    with open(sequence_file, "r", encoding="utf-8") as file:
        data = json.load(file)

    feature_count = data["feature_count"]
    feature_names = data["feature_names"]
    sequences = data["sequences"]
    sequence_metadata = data["sequence_metadata"]

    if feature_count != 16 or len(feature_names) != feature_count:
        raise ValueError("当前模型要求16维特征，且feature_names必须对应16维。")
    if len(sequences) != len(sequence_metadata):
        raise ValueError("行为序列与时间元数据的序列数量不一致。")

    samples = []
    masks = []
    sample_ids = []

    for sequence, metadata in zip(sequences, sequence_metadata):
        if len(sequence) != len(metadata):
            raise ValueError("某条序列的行为窗口与时间元数据数量不一致。")

        for start in range(0, len(sequence), SEQUENCE_LENGTH):
            chunk = sequence[start:start + SEQUENCE_LENGTH]
            chunk_metadata = metadata[start:start + SEQUENCE_LENGTH]

            # 与旧脚本相同：尾部只有1～2个真实窗口时舍弃该样本
            if len(chunk) < MIN_REAL_WINDOWS:
                continue
            if any(len(window) != feature_count for window in chunk):
                raise ValueError("发现维度不是16的行为窗口。")

            real_count = len(chunk)
            padding_count = SEQUENCE_LENGTH - real_count
            padded = chunk + [
                [0.0] * feature_count for _ in range(padding_count)
            ]
            mask = [True] * real_count + [False] * padding_count

            first = chunk_metadata[0]
            last = chunk_metadata[-1]
            participant_id = first["participant_id"]
            if any(item["participant_id"] != participant_id
                   for item in chunk_metadata):
                raise ValueError("一个样本中混入了不同用户的数据。")
            sample_id = (
                f"{participant_id}_"
                f"{first['window_start_ms']}_"
                f"{last['window_end_ms']}"
            )

            samples.append(padded)
            masks.append(mask)
            sample_ids.append(sample_id)

    if not samples:
        raise ValueError("没有生成任何有效训练样本。")
    if len(sample_ids) != len(set(sample_ids)):
        raise ValueError("出现重复的sample_id，请检查时间元数据。")

    # Training uses only explicitly labeled samples. Unlabeled windows are
    # kept in the source JSON for inference, but never used to fit the scaler.
    with open(label_file, "r", encoding="utf-8") as file:
        saved_labels = json.load(file)

    labeled_indexes = [
        index for index, sample_id in enumerate(sample_ids)
        if sample_id in saved_labels
    ]
    unlabeled_count = len(sample_ids) - len(labeled_indexes)
    if not labeled_indexes:
        raise ValueError("找不到任何已标注样本，无法训练。")

    samples = [samples[index] for index in labeled_indexes]
    masks = [masks[index] for index in labeled_indexes]
    sample_ids = [sample_ids[index] for index in labeled_indexes]

    if unlabeled_count:
        print(f"已跳过 {unlabeled_count} 个无标签样本（仅用于未来预测）。")

    features = torch.tensor(samples, dtype=torch.float32)
    real_mask = torch.tensor(masks, dtype=torch.bool)
    padding_mask = ~real_mask

    # 只用真实窗口统计；当前22个样本全部作为训练集
    real_features = features[real_mask]
    feature_mean = real_features.mean(dim=0)
    feature_std = real_features.std(dim=0)
    safe_std = torch.where(
        feature_std < 1e-6,
        torch.ones_like(feature_std),
        feature_std,
    )

    normalized_features = features.clone()
    normalized_features[real_mask] = (
        real_features - feature_mean
    ) / safe_std

    label_names = [saved_labels[sid] for sid in sample_ids]
    unknown_labels = set(label_names) - set(LABEL_TO_ID)
    if unknown_labels:
        raise ValueError(f"发现未知标签：{sorted(unknown_labels)}")
    labels = torch.tensor(
        [LABEL_TO_ID[name] for name in label_names],
        dtype=torch.long,
    )

    return {
        "features": normalized_features,
        "padding_mask": padding_mask,
        "labels": labels,
        "feature_mean": feature_mean,
        "safe_std": safe_std,
        "feature_names": feature_names,
        "label_to_id": LABEL_TO_ID.copy(),
        "sample_ids": sample_ids,
    }


if __name__ == "__main__":
    result = load_training_data()
    print("训练特征：", result["features"].shape)
    print("Padding Mask：", result["padding_mask"].shape)
    print("人工标签：", result["labels"].shape)
    print("样本ID数量：", len(result["sample_ids"]))
