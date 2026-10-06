"""Evaluate a saved checkpoint on the held-out test split; never train/download."""

import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from feature_extraction.inference_service import ImageInferenceService
from feature_extraction.training.dataset import ClothingDataset
from feature_extraction.training.engine import run_epoch


def evaluate(manifest, checkpoint, image_root=None, batch_size=16):
    if batch_size < 1:
        raise ValueError("batch_size must be positive.")
    dataset = ClothingDataset(manifest, "test", image_root)
    # Reuse the inference contract validation, including exact class order.
    service = ImageInferenceService(str(Path(checkpoint).resolve()))
    if not service.load_checkpoint():
        raise ValueError(f"Cannot evaluate checkpoint: {service.not_ready_reason}")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    # Internal access is confined here: evaluation needs raw logits for losses.
    model = service._model.to(device)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    return run_epoch(model, loader, device)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Evaluate all six heads on the test split.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--image-root", default=None)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args(argv)
    print(json.dumps(evaluate(args.manifest, args.checkpoint, args.image_root, args.batch_size), indent=2))


if __name__ == "__main__":
    main()
