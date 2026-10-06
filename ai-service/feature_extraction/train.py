"""Explicit CLI entry point. Importing this file never starts training."""

import argparse
import json
from pathlib import Path
import random

import torch
from torch.utils.data import DataLoader

from feature_extraction.model import ClothingModel
from feature_extraction.training.checkpoints import load_training_checkpoint
from feature_extraction.clothing_config import HEAD_NAMES
from feature_extraction.training.dataset import ClothingDataset, PartialLabelDataset
from feature_extraction.training.adapters.deepfashion_multimodal import ACTIVE_HEADS, load_deepfashion
from feature_extraction.training.engine import configure_stage, run_epoch, build_checkpoint, save_checkpoint, compute_class_weights


def main(argv=None):
    parser = argparse.ArgumentParser(description="Train clothing heads from CSV, DeepFashion Phase 1, or a reviewed Pakistani-fashion Phase 2 manifest.")
    parser.add_argument("--dataset", choices=("csv", "deepfashion-multimodal", "pakistani-fashion"), default="csv")
    parser.add_argument("--phase", choices=("phase1", "phase2"), default=None)
    parser.add_argument("--split-file", help="Persisted Phase 2 assignment JSON; default: output checkpoint stem + .splits.json")
    parser.add_argument("--manifest")
    parser.add_argument("--init-checkpoint", help="Warm-start v1/v2 weights; does not resume optimizer state")
    parser.add_argument("--shape-labels")
    parser.add_argument("--pattern-labels")
    parser.add_argument("--image-root", default=None)
    parser.add_argument("--output", default="checkpoints/clothing_best.pt")
    parser.add_argument("--head-epochs", type=int, default=5)
    parser.add_argument("--finetune-epochs", type=int, default=0)
    parser.add_argument("--final-blocks", type=int, default=2)
    parser.add_argument("--head-lr", type=float, default=1e-3)
    parser.add_argument("--finetune-lr", type=float, default=1e-4)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)
    if args.head_epochs < 1 or args.finetune_epochs < 0 or args.batch_size < 1:
        parser.error("head-epochs and batch-size must be positive; finetune-epochs must be nonnegative.")
    if not 0 < args.finetune_lr < args.head_lr or not 1 <= args.final_blocks <= 9:
        parser.error("Require 0 < finetune-lr < head-lr and final-blocks in 1..9 for B0.")
    phase1 = args.phase == "phase1"
    phase2 = args.phase == "phase2"
    if (args.dataset == "pakistani-fashion") != phase2:
        parser.error("Pakistani-fashion requires --phase phase2 (and vice versa).")
    if phase2:
        if not args.manifest or not args.init_checkpoint:
            parser.error("Phase 2 requires --manifest and --init-checkpoint.")
        if args.final_blocks > 3 or args.finetune_lr > args.head_lr / 10:
            parser.error("Phase 2 permits only the last 1-3 blocks and finetune-lr <= head-lr / 10.")
    if (args.dataset == "deepfashion-multimodal") != phase1:
        parser.error("DeepFashion-MultiModal requires --phase phase1 (and vice versa).")
    if phase1:
        if not all((args.image_root, args.shape_labels, args.pattern_labels)):
            parser.error("Phase 1 requires --image-root, --shape-labels and --pattern-labels.")
        if args.finetune_epochs:
            parser.error("Phase 1 trains only sleeve_length and pattern; backbone fine-tuning is disabled.")
    elif not args.manifest:
        parser.error("CSV training requires --manifest.")
    if Path(args.output).exists():
        parser.error("Output checkpoint already exists; choose a new run path.")
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if phase2:
        from feature_extraction.training.phase2_runner import run_phase2
        torch.backends.cudnn.benchmark = False
        torch.backends.cudnn.deterministic = True
        run_phase2(args, device)
        return
    # Validate manifests and file paths before constructing/downloading the backbone.
    active_heads = ACTIVE_HEADS if phase1 else HEAD_NAMES
    coverage = None
    if phase1:
        splits, report = load_deepfashion(args.image_root, args.shape_labels, args.pattern_labels, args.seed)
        if report["missing_images"]:
            raise FileNotFoundError(f"Missing annotated images: {report['missing_images']}")
        for split in ("train", "val"):
            for head in active_heads:
                if not report["splits"][split]["label_coverage"][head]["labeled"]:
                    raise ValueError(f"No {head} labels in {split} split")
        train_data = PartialLabelDataset(splits["train"], "train")
        val_data = PartialLabelDataset(splits["val"], "val")
        coverage = report
        print(json.dumps({"dataset_audit": report}), flush=True)
    else:
        train_data = ClothingDataset(args.manifest, "train", args.image_root)
        val_data = ClothingDataset(args.manifest, "val", args.image_root)
    class_weights = compute_class_weights(train_data.records, active_heads) if phase1 else None
    train_loader = DataLoader(train_data, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_data, batch_size=args.batch_size, shuffle=False, num_workers=0)
    model = ClothingModel(backbone_weights=None) if args.init_checkpoint else ClothingModel()
    if args.init_checkpoint:
        model.initialization_report = load_training_checkpoint(model, args.init_checkpoint)
        print(json.dumps({"initialization": model.initialization_report}), flush=True)
    model = model.to(device)
    best_loss = float("inf")
    epoch = 0
    stages = [("heads", args.head_epochs, 0, args.head_lr),
              ("finetune", args.finetune_epochs, args.final_blocks, args.finetune_lr)]
    for stage, count, blocks, lr in stages:
        if not count:
            continue
        configure_stage(model, blocks, active_heads)
        optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=lr)
        for _ in range(count):
            epoch += 1
            train_metrics = run_epoch(model, train_loader, device, optimizer, blocks, active_heads, class_weights=class_weights)
            validation = run_epoch(model, val_loader, device, active_heads=active_heads, class_weights=class_weights)
            print(json.dumps({"epoch": epoch, "stage": stage, "device": str(device),
                              "train": train_metrics, "val": validation}), flush=True)
            if validation["total_loss"] < best_loss:
                best_loss = validation["total_loss"]
                checkpoint = build_checkpoint(model, epoch, validation, stage, vars(args),
                                              active_heads=active_heads, phase=args.phase,
                                              label_coverage=coverage, class_weights=class_weights)
                save_checkpoint(checkpoint, args.output)
    print(f"Best checkpoint: {args.output}; validation loss: {best_loss:.6f}")


if __name__ == "__main__":
    main()
