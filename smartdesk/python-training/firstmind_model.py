import torch
import torch.nn as nn


class FirstMindTransformer(nn.Module):

    def __init__(
        self,
        input_dim=16,
        model_dim=64,
        sequence_length=6,
        num_classes=3
    ):
        super().__init__()

        # 1. 输入层：16维 → 64维
        self.input_projection = nn.Linear(
            input_dim,
            model_dim
        )

        # 2. 位置向量
        self.position_embedding = nn.Embedding(
            sequence_length,
            model_dim
        )

        # 3. Transformer：4头自注意力
        self.encoder = nn.TransformerEncoderLayer(
            d_model=model_dim,
            nhead=4,
            dim_feedforward=128,
            dropout=0.1,
            batch_first=True
        )

        # 4. 最终分类器
        self.classifier = nn.Linear(
            model_dim,
            num_classes
        )

    def forward(self, features, padding_mask):

        # 输入特征：16 → 64
        x = self.input_projection(features)

        # 生成位置编号
        position_ids = torch.arange(
            x.shape[1],
            device=x.device
        )

        # 加入位置向量
        x = x + self.position_embedding(
            position_ids
        )

        # 多头自注意力
        x = self.encoder(
            x,
            src_key_padding_mask=padding_mask
        )

        # 只保留真实时间片
        real_mask = (
            (~padding_mask)
            .unsqueeze(-1)
            .float()
        )

        # Masked Mean Pooling
        summed = (x * real_mask).sum(dim=1)

        counts = real_mask.sum(dim=1).clamp(min=1.0)

        pooled = summed / counts

        # 64维 → 分类分数
        logits = self.classifier(pooled)

        return logits