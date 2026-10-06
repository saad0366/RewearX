"""Phase 2 orchestration, invoked only by the explicit training CLI."""

import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from feature_extraction.clothing_config import ARCHITECTURE, FORMAT_VERSION, HEAD_TASKS, CLASS_NAMES
from feature_extraction.model import ClothingModel
from feature_extraction.training.checkpoints import load_training_checkpoint
from feature_extraction.training.dataset import PartialLabelDataset
from feature_extraction.training.engine import configure_stage, run_epoch, build_checkpoint, save_checkpoint
from feature_extraction.training.phase2 import (
    ACTIVE_HEADS, FROZEN_HEADS, SELECTION, prepare_phase2, phase2_weights,
    frozen_snapshot, assert_frozen_unchanged, selection_score, file_sha256,
)


def run_phase2(args, device):
    output = Path(args.output).resolve()
    source = Path(args.init_checkpoint).resolve()
    split_file = Path(args.split_file).resolve() if args.split_file else output.with_suffix(".splits.json")
    metrics_file = output.with_suffix(".test_metrics.json")
    if output == source or split_file in (source, output, metrics_file) or metrics_file == source:
        raise ValueError("Input checkpoint, output checkpoint, split and metric paths must be distinct")
    if metrics_file.exists():
        raise FileExistsError("Test metrics already exist; choose a new output checkpoint name")
    source_hash = file_sha256(source)
    splits, metadata = prepare_phase2(args.manifest, split_file, image_root=args.image_root, seed=args.seed)
    for split in ("train", "val"):
        for head in ACTIVE_HEADS:
            if not metadata["valid_counts"][split][head]:
                raise ValueError(f"Phase 2 requires at least one valid {head} label in {split}; no labels will be invented")
    datasets = {split: PartialLabelDataset(records, split) for split, records in splits.items() if records}
    ce_weights, pos_weight = phase2_weights(datasets["train"].records)
    generator = torch.Generator().manual_seed(args.seed)
    loaders = {name: DataLoader(data, batch_size=args.batch_size, shuffle=name == "train",
                               num_workers=0, generator=generator if name == "train" else None)
               for name, data in datasets.items()}
    model = ClothingModel(backbone_weights=None)
    model.initialization_report = load_training_checkpoint(model, source)
    model.initialization_report["source_sha256"] = source_hash
    print(json.dumps({"initialization": model.initialization_report, "dataset": metadata}), flush=True)
    # Keep the reference on CPU; comparisons remain exact on CPU or CUDA.
    frozen_before = frozen_snapshot(model)
    model = model.to(device)
    best_score = float("-inf")
    epoch = 0
    for stage, epochs, blocks, lr in (("heads", args.head_epochs, 0, args.head_lr),
                                      ("finetune", args.finetune_epochs, args.final_blocks, args.finetune_lr)):
        if not epochs:
            continue
        configure_stage(model, blocks, ACTIVE_HEADS)
        assert_frozen_unchanged(model, frozen_before)
        parameters = [p for p in model.parameters() if p.requires_grad]
        forbidden = {id(p) for head in FROZEN_HEADS for p in model.heads[head].parameters()}
        if any(id(p) in forbidden for p in parameters):
            raise RuntimeError("Frozen parameters must not enter optimizer")
        optimizer = torch.optim.AdamW(parameters, lr=lr)
        for _ in range(epochs):
            epoch += 1
            train = run_epoch(model, loaders["train"], device, optimizer, blocks, ACTIVE_HEADS,
                              class_weights=ce_weights, color_pos_weight=pos_weight, allow_empty=True)
            assert_frozen_unchanged(model, frozen_before)
            validation = run_epoch(model, loaders["val"], device, active_heads=ACTIVE_HEADS,
                                   class_weights=ce_weights, color_pos_weight=pos_weight, allow_empty=True)
            score = selection_score(validation)
            print(json.dumps({"epoch": epoch, "stage": stage, "train": train, "val": validation,
                              "selection_score": score}), flush=True)
            if score > best_score:
                best_score = score
                checkpoint = build_checkpoint(model, epoch, validation, stage, vars(args),
                                              phase="phase2", active_heads=ACTIVE_HEADS,
                                              class_weights=ce_weights, color_pos_weight=pos_weight,
                                              label_coverage=metadata)
                checkpoint["training_metadata"].update(
                    dataset=metadata, parser_versions=metadata["parser_versions"],
                    selection={"criterion": SELECTION, "score": score, "maximize": True},
                    frozen_heads_verified=True,
                    resume_policy="weights-only warm start; optimizer/RNG/epoch state not resumed")
                save_checkpoint(checkpoint, output)
    # Held-out test data is evaluated only after best model selection is complete.
    best = torch.load(output, map_location="cpu", weights_only=True)
    if (best["architecture"], best["format_version"], best["head_tasks"], best["class_names"]) != (
            ARCHITECTURE, FORMAT_VERSION, HEAD_TASKS, CLASS_NAMES):
        raise ValueError("Unexpected best checkpoint configuration")
    model.load_state_dict(best["state_dict"], strict=True)
    assert_frozen_unchanged(model, frozen_before)
    test = run_epoch(model, loaders["test"], device, active_heads=ACTIVE_HEADS,
                     class_weights=ce_weights, color_pos_weight=pos_weight, allow_empty=True) if "test" in loaders else None
    with metrics_file.open("x", encoding="utf-8") as stream:
        json.dump({"checkpoint": str(output), "test": test, "selection_score": best_score,
                   "empty_test_split": "test" not in loaders}, stream, indent=2)
        stream.write("\n")
    if file_sha256(source) != source_hash:
        raise RuntimeError("Initialization checkpoint changed during training")
    print(f"Best Phase 2 checkpoint: {output}; validation score: {best_score:.6f}")
