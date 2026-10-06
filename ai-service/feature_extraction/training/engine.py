"""Simple six-task loss, epoch metrics, transfer learning, and checkpoints."""

from datetime import datetime, timezone
import math
from pathlib import Path
import os
import tempfile

import torch
from torch import nn

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES, validate_class_names
from feature_extraction.clothing_config import ARCHITECTURE, FORMAT_VERSION, HEAD_TASKS, COLOR_THRESHOLD


def configure_stage(model, final_blocks=0, active_heads=HEAD_NAMES):
    """Freeze all features, optionally unfreeze the final N sequential blocks."""
    if not 0 <= final_blocks <= len(model.backbone):
        raise ValueError("final_blocks must be between 0 and the number of backbone blocks.")
    model.backbone.requires_grad_(False)
    active_heads = validate_active_heads(active_heads)
    for name, head in model.heads.items():
        head.requires_grad_(name in active_heads)
    if final_blocks:
        for block in list(model.backbone.children())[-final_blocks:]:
            block.requires_grad_(True)


def validate_active_heads(active_heads):
    active_heads = tuple(active_heads)
    if not active_heads or len(set(active_heads)) != len(active_heads) or set(active_heads) - set(HEAD_NAMES):
        raise ValueError("Expected unique known active heads")
    return active_heads


def compute_class_weights(train_records, active_heads, *, max_weight=None, allow_empty=False):
    """Balanced inverse frequencies N/(K*n), using encoded TRAIN records only.

    K counts observed classes. Missing (-100) and unseen classes have no weight.
    Before optional clipping, average weight over labeled training samples is one.
    """
    active_heads = validate_active_heads(active_heads)
    if "color" in active_heads:
        raise ValueError("Inverse-frequency CE weights are only for multiclass heads")
    frequencies = {h: torch.zeros(len(CLASS_NAMES[h]), dtype=torch.long) for h in active_heads}
    for _, targets in train_records:
        for head in active_heads:
            target = targets[head]
            if target == -100:
                continue
            if not 0 <= target < len(CLASS_NAMES[head]):
                raise ValueError(f"Invalid {head} target: {target}")
            frequencies[head][target] += 1
    weights = {}
    for head, counts in frequencies.items():
        observed = counts > 0
        if not observed.any() and not allow_empty:
            raise ValueError(f"No training labels for {head}")
        weight = torch.zeros(len(counts), dtype=torch.float32)
        if observed.any():
            weight[observed] = counts.sum().float() / (observed.sum() * counts[observed].float())
        if max_weight is not None:
            weight.clamp_(max=max_weight)
        weights[head] = weight
    return weights


def run_epoch(model, loader, device, optimizer=None, final_blocks=0, active_heads=HEAD_NAMES,
              class_weights=None, color_pos_weight=None, allow_empty=False):
    active_heads = validate_active_heads(active_heads)
    training = optimizer is not None
    model.train(training)
    if training:
        model.backbone.eval()
        if final_blocks:
            for block in list(model.backbone.children())[-final_blocks:]:
                block.train()
    class_weights = {} if class_weights is None else class_weights
    if set(class_weights) - set(active_heads):
        raise ValueError("Class weights may only configure active heads")
    loss_fns = {}
    for head in active_heads:
        weight = class_weights.get(head)
        if weight is not None:
            weight = weight.to(device=device, dtype=torch.float32)
            if weight.shape != (len(CLASS_NAMES[head]),) or not torch.isfinite(weight).all() or (weight < 0).any():
                raise ValueError(f"Invalid class weights for {head}")
        # Mean over labeled samples keeps the existing per-head normalization.
        if head == "color":
            if weight is not None:
                raise ValueError("Multiclass weights cannot be used for multilabel color")
            positive_weight = color_pos_weight
            if positive_weight is not None:
                positive_weight = positive_weight.to(device=device, dtype=torch.float32)
                if positive_weight.shape != (len(CLASS_NAMES["color"]),) or not torch.isfinite(positive_weight).all() or (positive_weight < 0).any():
                    raise ValueError("Invalid color pos_weight")
            loss_fns[head] = nn.BCEWithLogitsLoss(pos_weight=positive_weight, reduction="none")
        else:
            loss_fns[head] = nn.CrossEntropyLoss(weight=weight, reduction="none")
    samples = 0
    losses = {head: 0.0 for head in HEAD_NAMES}
    correct = {head: 0 for head in HEAD_NAMES}
    counts = {head: 0 for head in HEAD_NAMES}
    class_counts = {h: torch.zeros(len(CLASS_NAMES[h]), dtype=torch.long) for h in HEAD_NAMES}
    class_correct = {h: torch.zeros(len(CLASS_NAMES[h]), dtype=torch.long) for h in HEAD_NAMES}
    color_tp = torch.zeros(len(CLASS_NAMES["color"]), dtype=torch.long)
    color_fp = torch.zeros_like(color_tp)
    color_fn = torch.zeros_like(color_tp)
    with torch.set_grad_enabled(training):
        for batch in loader:
            # Legacy fully labeled callers may still pass (images, targets).
            images, targets = batch[:2]
            masks = batch[2] if len(batch) == 3 else {
                head: torch.ones(images.size(0), dtype=torch.bool) for head in HEAD_NAMES}
            images = images.to(device)
            samples += images.size(0)
            targets = {head: targets[head].to(device) for head in HEAD_NAMES}
            masks = {head: masks[head].to(device=device, dtype=torch.bool) for head in HEAD_NAMES}
            if training:
                optimizer.zero_grad(set_to_none=True)
            available = [head for head in active_heads if masks[head].any().item()]
            if not available:
                continue  # No forward/backward/optimizer update without supervision.
            logits = model(images)
            if "color" in available:
                color_targets = targets["color"][masks["color"]]
                if color_targets.shape != logits["color"][masks["color"]].shape or not torch.isfinite(color_targets).all() or not ((color_targets == 0) | (color_targets == 1)).all():
                    raise ValueError("Color targets must be finite binary multi-hot vectors")
            batch_losses = {head: loss_fns[head](logits[head][masks[head]], targets[head][masks[head]].float() if head == "color" else targets[head][masks[head]]).mean()
                            for head in available}
            total = sum(batch_losses.values())
            if not torch.isfinite(total):
                raise ValueError("Non-finite total loss; refusing to continue/save a checkpoint.")
            has_weight = any(loss_fns[h].weight is None or
                             (loss_fns[h].weight[targets[h][masks[h]]] > 0).any().item()
                             for h in available)
            if training and has_weight:
                total.backward()
                optimizer.step()
            for head in available:
                count = masks[head].sum().item()
                counts[head] += count
                losses[head] += batch_losses[head].item() * count
                truth = targets[head][masks[head]]
                if head == "color":
                    predicted = torch.sigmoid(logits[head][masks[head]]) >= COLOR_THRESHOLD
                    positive = truth.bool()
                    matched = predicted == positive
                    color_tp += (predicted & positive).sum(dim=0).cpu()
                    color_fp += (predicted & ~positive).sum(dim=0).cpu()
                    color_fn += (~predicted & positive).sum(dim=0).cpu()
                    correct[head] += matched.all(dim=1).sum().item()
                    class_counts[head] += count
                    class_correct[head] += matched.sum(dim=0).cpu()
                    continue
                matched = logits[head][masks[head]].argmax(dim=1) == truth
                correct[head] += matched.sum().item()
                class_counts[head] += torch.bincount(truth, minlength=len(CLASS_NAMES[head])).cpu()
                class_correct[head] += torch.bincount(truth[matched], minlength=len(CLASS_NAMES[head])).cpu()
    if not samples:
        raise ValueError("Cannot compute metrics for an empty split.")
    if not any(counts.values()) and not allow_empty:
        raise ValueError("No available labels for active heads in this split.")
    heads = {head: {"loss": losses[head] / counts[head] if counts[head] else None,
                    "accuracy": correct[head] / counts[head] if counts[head] else None,
                    "labeled_samples": counts[head],
                    "per_class": {label: {
                        "accuracy": (class_correct[head][i].item() / class_counts[head][i].item()
                                     if class_counts[head][i] else None),
                        "labeled_samples": class_counts[head][i].item(),
                    } for i, label in enumerate(CLASS_NAMES[head])}} for head in HEAD_NAMES}
    if counts["color"]:
        tp, fp, fn = color_tp.float(), color_fp.float(), color_fn.float()
        precision = tp / (tp + fp).clamp_min(1)
        recall = tp / (tp + fn).clamp_min(1)
        f1 = 2 * tp / (2 * tp + fp + fn).clamp_min(1)
        support = tp + fn
        for i, label in enumerate(CLASS_NAMES["color"]):
            heads["color"]["per_class"][label].update(
                precision=precision[i].item(), recall=recall[i].item(), f1=f1[i].item(),
                positive_samples=int(support[i].item()))
        heads["color"]["micro_f1"] = (2 * tp.sum() / (2 * tp.sum() + fp.sum() + fn.sum()).clamp_min(1)).item()
        heads["color"]["macro_f1"] = f1[support > 0].mean().item() if (support > 0).any() else None
    else:
        heads["color"].update(micro_f1=None, macro_f1=None)
    return {"samples": samples,
            "total_loss": sum(value["loss"] for value in heads.values() if value["loss"] is not None),
            "heads": heads}


def build_checkpoint(model, epochs, validation, stage, run_settings, *,
                     active_heads=HEAD_NAMES, phase=None, label_coverage=None, class_weights=None, color_pos_weight=None):
    """Called only after a completed training epoch and its validation pass."""
    if epochs < 1 or not math.isfinite(validation["total_loss"]):
        raise ValueError("A completed epoch and finite validation loss are required.")
    active_heads = validate_active_heads(active_heads)
    deployable = phase not in ("phase1", "phase2") and set(active_heads) == set(HEAD_NAMES)
    deployable = deployable and all(validation["heads"][h]["loss"] is not None for h in HEAD_NAMES)
    labels = validate_class_names(model.class_names)
    if labels != validate_class_names(CLASS_NAMES):
        raise ValueError("Model taxonomy differs from inference taxonomy.")
    state = {name: value.detach().cpu().clone() for name, value in model.state_dict().items()}
    if any(not torch.isfinite(value).all() for value in state.values()):
        raise ValueError("Refusing to save non-finite model weights.")
    return {
        "format_version": FORMAT_VERSION,
        "head_tasks": dict(HEAD_TASKS),
        "architecture": ARCHITECTURE,
        "trained": deployable,
        "class_names": labels,
        "state_dict": state,
        "training_metadata": {
            "frozen_heads": [h for h in HEAD_NAMES if h not in active_heads],
            "color_pos_weight": color_pos_weight.tolist() if color_pos_weight is not None else None,
            "validation_metrics": validation,
            "class_weights": {h: w.tolist() for h, w in (class_weights or {}).items()},
            "per_class_validation": {h: validation["heads"][h].get("per_class", {}) for h in HEAD_NAMES},
            "phase": phase,
            "active_heads": list(active_heads),
            "label_coverage": label_coverage,
            "epochs": epochs,
            "stage": stage,
            "best_validation_loss": validation["total_loss"],
            "per_head_validation_accuracy": {h: validation["heads"][h]["accuracy"] for h in HEAD_NAMES},
            "per_head_validation_loss": {h: validation["heads"][h]["loss"] for h in HEAD_NAMES},
            "training_timestamp": datetime.now(timezone.utc).isoformat(),
            "settings": run_settings,
            "initialization": getattr(model, "initialization_report", None),
        },
    }


def save_checkpoint(checkpoint, destination):
    """Atomic replacement prevents an interrupted save from corrupting the best file."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".checkpoint-", suffix=".tmp", dir=destination.parent)
    os.close(descriptor)
    try:
        torch.save(checkpoint, temporary)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
