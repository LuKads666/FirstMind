"""Export the teammate's FirstMind checkpoint for the Electron runtime.

Run from any directory: python python-training/export_firstmind_onnx.py
"""

import json
from pathlib import Path

import torch

from firstmind_model import FirstMindTransformer


ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = Path(__file__).with_name("firstmind_transformer.pth")
OUTPUT = ROOT / "resources" / "onnx"


def main():
    checkpoint = torch.load(CHECKPOINT, map_location="cpu", weights_only=True)
    config = checkpoint["model_config"]
    model = FirstMindTransformer(**config)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    OUTPUT.mkdir(parents=True, exist_ok=True)
    features = torch.zeros(1, config["sequence_length"], config["input_dim"])
    padding_mask = torch.zeros(1, config["sequence_length"], dtype=torch.bool)
    torch.onnx.export(
        model,
        (features, padding_mask),
        OUTPUT / "firstmind.onnx",
        input_names=["features", "padding_mask"],
        output_names=["logits"],
        opset_version=17,
        dynamo=False,
    )
    metadata = {
        "source": "LuKads666/FirstMind",
        "model_config": config,
        "feature_names": checkpoint["feature_names"],
        "label_to_id": checkpoint["label_to_id"],
        "feature_mean": checkpoint["feature_mean"].tolist(),
        "safe_std": checkpoint["safe_std"].tolist(),
    }
    (OUTPUT / "firstmind.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Exported {OUTPUT / 'firstmind.onnx'}")


if __name__ == "__main__":
    main()
