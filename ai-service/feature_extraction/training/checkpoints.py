"""Validated warm-start loading; never marks a partial model inference-ready."""

from pathlib import Path

import torch

from feature_extraction.clothing_config import (
    ARCHITECTURE, FORMAT_VERSION, HEAD_TASKS, CLASS_NAMES, validate_class_names,
)


def load_training_checkpoint(model, checkpoint_path):
    """Load all compatible tensors, allowing only color/category to be reset.

    Strict checks on backbone and the other four heads precede any mutation.
    Task/label changes reset a whole head even when tensor dimensions match,
    except the explicit v2 kurti-to-skirt migration, which retains the fresh
    target row at index 8 and copies the other eleven category rows.
    The source file is read-only; optimizer state is intentionally not resumed.
    """
    path = Path(checkpoint_path).resolve()
    checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(checkpoint, dict):
        raise ValueError("Checkpoint must be a dictionary")
    legacy = (checkpoint.get("format_version"), checkpoint.get("architecture")) == (
        1, "efficientnet_b0_six_head_v1")
    current = (checkpoint.get("format_version"), checkpoint.get("architecture")) == (
        FORMAT_VERSION, ARCHITECTURE)
    if not (legacy or current):
        raise ValueError("Unsupported checkpoint architecture/format")
    if not isinstance(checkpoint.get("trained"), bool):
        raise ValueError("Checkpoint must declare trained as a boolean")
    labels = validate_class_names(checkpoint.get("class_names", {}))
    tasks = {h: "multiclass" for h in CLASS_NAMES} if legacy else checkpoint.get("head_tasks")
    if not isinstance(tasks, dict) or set(tasks) != set(HEAD_TASKS):
        raise ValueError("Missing/invalid head tasks")
    if any(task not in ("multiclass", "multilabel") for task in tasks.values()):
        raise ValueError("Unsupported head task")
    target_labels = validate_class_names(model.class_names)
    if target_labels != validate_class_names(CLASS_NAMES):
        raise ValueError("Target model must use the current taxonomy")
    state = checkpoint.get("state_dict")
    if not isinstance(state, dict) or not state:
        raise ValueError("Missing full state_dict")
    if any(not isinstance(v, torch.Tensor) or not torch.isfinite(v).all() for v in state.values()):
        raise ValueError("Invalid/non-finite checkpoint tensors")
    expected = model.state_dict()
    if set(state) != set(expected):
        raise ValueError("Checkpoint must contain complete backbone and all six heads")
    previous_categories = (
        "t_shirt", "shirt", "hoodie", "sweater", "jacket", "jeans", "trousers",
        "dress", "kurti", "shalwar_kameez", "lehenga", "other_fashion",
    )
    migrate_category = (current and tasks["category"] == HEAD_TASKS["category"]
                        and labels["category"] == previous_categories
                        and target_labels["category"] == (*previous_categories[:8], "skirt", *previous_categories[9:]))
    skipped_heads = {}
    for head in CLASS_NAMES:
        keys = [k for k in expected if k.startswith(f"heads.{head}.")]
        # Check source tensors against its declared vocabulary, even if resetting.
        for key in keys:
            source_shape = (len(labels[head]), *expected[key].shape[1:])
            if tuple(state[key].shape) != source_shape:
                raise ValueError(f"Corrupt tensor dimensions for {key}")
        compatible = labels[head] == target_labels[head] and tasks[head] == HEAD_TASKS[head]
        if not compatible and not (head == "category" and migrate_category):
            if head not in ("color", "category"):
                raise ValueError(f"Incompatible protected head: {head}")
            skipped_heads[head] = "class ordering/size or task changed"
    loaded, skipped, partial = [], [], {}
    merged = dict(expected)
    for key, value in state.items():
        if any(key.startswith(f"heads.{head}.") for head in skipped_heads):
            skipped.append(key)
            continue
        if value.shape != expected[key].shape or value.dtype != expected[key].dtype:
            raise ValueError(f"Incompatible tensor: {key}")
        if migrate_category and key.startswith("heads.category."):
            # Clone rather than writing through state_dict's parameter views.
            # Validation of every tensor completes before the model is mutated.
            migrated = value.to(device=expected[key].device).clone()
            migrated[8].copy_(expected[key][8])
            merged[key] = migrated
            partial[key] = {"loaded_rows": [i for i in range(12) if i != 8],
                            "fresh_rows": [8], "source_label": "kurti", "target_label": "skirt"}
            continue
        merged[key] = value
        loaded.append(key)
    model.load_state_dict(merged, strict=True)
    return {"source": str(path), "source_architecture": checkpoint["architecture"],
            "loaded_keys": loaded, "skipped_keys": skipped, "reset_heads": skipped_heads,
            "partially_loaded_keys": partial}
