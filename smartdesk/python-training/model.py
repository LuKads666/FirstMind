# -*- coding: utf-8 -*-
"""
轻量行为序列 Transformer（设计文档 11.2）
4 层编码器 / 4 头注意力 / d_model 128 / 前馈 512 / 最大序列 128 / 约 1-3M 参数
"""
import math

import torch
import torch.nn as nn

from features import CATEGORY_LIST, NUM_FEATURES, SEQ_LEN

D_MODEL = 128
NHEAD = 4
NUM_LAYERS = 4
DIM_FF = 512
DROPOUT = 0.1


class BehaviorTransformer(nn.Module):
    def __init__(
        self,
        num_categories: int = len(CATEGORY_LIST),
        d_model: int = D_MODEL,
        nhead: int = NHEAD,
        num_layers: int = NUM_LAYERS,
        dim_ff: int = DIM_FF,
        dropout: float = DROPOUT,
        max_len: int = SEQ_LEN,
    ):
        super().__init__()
        self.num_proj = nn.Linear(NUM_FEATURES, d_model)
        self.cat_emb = nn.Embedding(num_categories, d_model)
        self.pos_emb = nn.Embedding(max_len, d_model)
        self.input_norm = nn.LayerNorm(d_model)
        self.input_dropout = nn.Dropout(dropout)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_ff,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

        self.activity_head = nn.Linear(d_model, num_categories)
        self.distraction_head = nn.Linear(d_model, 1)
        self.duration_head = nn.Linear(d_model, 1)

    def forward(self, x_num: torch.Tensor, x_cat: torch.Tensor) -> dict:
        b, t, _ = x_num.shape
        pos = torch.arange(t, device=x_num.device).unsqueeze(0).expand(b, t)
        h = self.num_proj(x_num) + self.cat_emb(x_cat) + self.pos_emb(pos)
        h = self.input_dropout(self.input_norm(h))
        h = self.encoder(h)
        pooled = h.mean(dim=1)
        return {
            "activity_logits": self.activity_head(pooled),
            "distraction_prob": torch.sigmoid(self.distraction_head(pooled)),
            "duration_pred": torch.sigmoid(self.duration_head(pooled)),
        }

    def forward_for_onnx(self, x_num: torch.Tensor, x_cat: torch.Tensor):
        out = self.forward(x_num, x_cat)
        return out["activity_logits"], out["distraction_prob"], out["duration_pred"]


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
