"""DeepFashion-MultiModal Phase 1 mappings and read-only dataset audit."""

import hashlib
from pathlib import Path
import re

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES

ACTIVE_HEADS = ("sleeve_length", "pattern")
SLEEVE_MAP = {0: "sleeveless", 1: "short", 2: "three_quarter", 3: "full", 4: None, 5: None}
PATTERN_MAP = {0: "floral", 1: "printed", 2: "striped", 3: "plain", 4: "checked",
               5: None, 6: None, 7: None}


def read_annotations(path, kind):
    """Reject malformed/duplicate annotations instead of silently guessing labels."""
    if kind not in ("shape", "pattern"):
        raise ValueError("Expected shape or pattern annotations")
    result = {}
    with Path(path).open(encoding="utf-8-sig") as stream:
        for line_number, line in enumerate(stream, 1):
            parts = line.split()
            if not parts:
                continue
            try:
                name, *raw = parts
                if Path(name).name != name or "\\" in name or name in result:
                    raise ValueError("unsafe or duplicate filename")
                values = [int(value) for value in raw]
                if kind == "shape":
                    if not values:
                        raise ValueError("missing sleeve code")
                    label = SLEEVE_MAP[values[0]]
                else:
                    if len(values) != 3:
                        raise ValueError("expected upper, lower, outer codes")
                    labels = [PATTERN_MAP[value] for value in values]
                    label = next((value for value in labels if value is not None), None)
                result[name] = label
            except (ValueError, KeyError) as exc:
                raise ValueError(f"{path}:{line_number}: invalid {kind} annotation: {exc}") from exc
    return result


def split_for_filename(filename, seed=42):
    """Stable 80/10/10 train/val/test partition, grouped by garment id."""
    match = re.search(r"id_\d+", filename)
    if not match:
        raise ValueError(f"Cannot determine garment id for split: {filename}")
    digest = hashlib.sha256(f"{seed}:{match.group()}".encode()).digest()
    fraction = int.from_bytes(digest[:8], "big") / 2**64
    return "train" if fraction < 0.8 else "val" if fraction < 0.9 else "test"


def label_coverage(records):
    counts = {head: {label: 0 for label in CLASS_NAMES[head]} for head in HEAD_NAMES}
    for _, labels in records:
        for head in HEAD_NAMES:
            if labels.get(head) is not None:
                counts[head][labels[head]] += 1
    return {head: {"labeled": sum(values.values()), "classes": values}
            for head, values in counts.items()}


def load_deepfashion(image_root, shape_path, pattern_path, seed=42):
    root = Path(image_root).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Image directory not found: {root}")
    sleeves = read_annotations(shape_path, "shape")
    patterns = read_annotations(pattern_path, "pattern")
    splits = {name: [] for name in ("train", "val", "test")}
    missing, unlabeled, existing = [], [], []
    for name in sorted(sleeves.keys() | patterns.keys()):
        path = root / name
        if not path.is_file():
            missing.append(name)
            continue
        labels = {head: None for head in HEAD_NAMES}
        labels.update(sleeve_length=sleeves.get(name), pattern=patterns.get(name))
        existing.append((path, labels))
        if not any(labels.values()):
            unlabeled.append(name)
            continue
        splits[split_for_filename(name, seed)].append((path, labels))
    report = {
        "adapter": "deepfashion-multimodal", "seed": seed,
        "split_policy": "garment-id SHA256 80/10/10 train/val/test",
        "shape_rows": len(sleeves), "pattern_rows": len(patterns),
        "annotated_images": len(sleeves.keys() | patterns.keys()),
        "existing_images": len(existing), "missing_images": missing,
        "images_without_usable_labels": len(unlabeled),
        "label_coverage": label_coverage(existing),
        "splits": {name: {"images": len(records), "label_coverage": label_coverage(records)}
                   for name, records in splits.items()},
    }
    return splits, report
