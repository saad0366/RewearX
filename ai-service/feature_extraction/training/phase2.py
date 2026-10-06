"""Phase 2 manifest preparation, balancing, freezing, and selection utilities."""

import csv
import hashlib
import json
from pathlib import Path, PureWindowsPath

import torch

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES
from feature_extraction.training.dataset import encode_color
from feature_extraction.training.engine import compute_class_weights

ACTIVE_HEADS = ("color", "category", "pattern")
FROZEN_HEADS = tuple(h for h in HEAD_NAMES if h not in ACTIVE_HEADS)
SPLIT_POLICY = "sha256(seed:image_content_sha256), 80/10/10 train/val/test, v1"
SELECTION = "mean(color macro F1, category supported-class mean accuracy, pattern supported-class mean accuracy)"


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_split(digest, seed=42):
    value = int.from_bytes(hashlib.sha256(f"{seed}:{digest}".encode()).digest()[:8], "big") / 2**64
    return "train" if value < 0.8 else "val" if value < 0.9 else "test"


def _resolve_image(row, manifest, image_root):
    if image_root is not None:
        # Generated manifests may contain Windows paths even on Kaggle/Linux.
        identifier = row.get("image_identifier", "").strip()
        if not identifier or identifier == "embedded_image":
            identifier = row["image_path"]
        if PureWindowsPath(identifier).is_absolute() or Path(identifier).is_absolute():
            identifier = PureWindowsPath(identifier).name
        candidate = (image_root / identifier.replace("\\", "/")).resolve()
        if not candidate.is_relative_to(image_root):
            raise ValueError(f"Image identifier escapes image root: {identifier}")
    else:
        candidate = (manifest.parent / row["image_path"]).resolve()
    if not candidate.is_file():
        raise FileNotFoundError(f"Image not found: {candidate}; set --image-root when relocating the dataset")
    return candidate


def prepare_phase2(manifest_path, split_path, *, image_root=None, seed=42):
    """Read the derived manifest; never reparse captions or use review as rejection.

    Identical image bytes always stay together. Assignment is portable across
    image relocation. A changed manifest, image content, seed or policy invalidates
    an existing split file instead of silently producing a different experiment.
    """
    manifest = Path(manifest_path).resolve()
    split_path = Path(split_path).resolve()
    if split_path == manifest:
        raise ValueError("Split output must not overwrite the input manifest")
    image_root = Path(image_root).resolve() if image_root else None
    splits = {name: [] for name in ("train", "val", "test")}
    coverage = {name: {h: {c: 0 for c in CLASS_NAMES[h]} for h in HEAD_NAMES} for name in splits}
    assignments, versions, cached_hashes = [], set(), {}
    review_rows = zero_active = 0
    with manifest.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {"image_path", "parsed_colors", "parser_version", *[f"{h}_valid" for h in HEAD_NAMES],
                    *[h for h in HEAD_NAMES if h != "color"]}
        columns = reader.fieldnames or []
        if required - set(columns) or len(columns) != len(set(columns)):
            raise ValueError(f"Invalid Phase 2 manifest headers; missing={sorted(required - set(columns))}")
        for index, row in enumerate(reader, 1):
            if None in row or any(row.get(key) is None for key in required):
                raise ValueError(f"Malformed manifest row {index}")
            version = row["parser_version"].strip()
            if not version:
                raise ValueError(f"Missing parser version at row {index}")
            versions.add(version)
            labels = dict.fromkeys(HEAD_NAMES)
            for head in HEAD_NAMES:
                mask = row[f"{head}_valid"].strip()
                if mask not in ("0", "1"):
                    raise ValueError(f"Row {index}: {head}_valid must be 0 or 1")
                if mask == "0":
                    continue  # Even a stale/nonempty label must not override its mask.
                if head == "color":
                    values = json.loads(row["parsed_colors"])
                    if not isinstance(values, list) or not values:
                        raise ValueError(f"Row {index}: valid color requires an atomic color list")
                    encode_color(values)
                    labels[head] = values
                else:
                    value = row[head].strip()
                    if value not in CLASS_NAMES[head]:
                        raise ValueError(f"Row {index}: invalid {head} label: {value}")
                    labels[head] = value
            path = _resolve_image(row, manifest, image_root)
            if path not in cached_hashes:
                cached_hashes[path] = file_sha256(path)
            digest = cached_hashes[path]
            split = image_split(digest, seed)
            assignments.append({"row": index, "image_sha256": digest, "split": split})
            splits[split].append((path, labels))
            review_rows += row.get("review_required") == "1"
            zero_active += not any(labels[h] is not None for h in ACTIVE_HEADS)
            for head in HEAD_NAMES:
                if labels[head] is not None:
                    for value in labels[head] if head == "color" else [labels[head]]:
                        coverage[split][head][value] += 1
    if not assignments:
        raise ValueError("Manifest is empty")
    persisted = {"manifest_sha256": file_sha256(manifest), "seed": seed, "policy": SPLIT_POLICY,
                 "assignments": assignments}
    if split_path.exists():
        if json.loads(split_path.read_text(encoding="utf-8")) != persisted:
            raise ValueError("Persisted split does not match manifest/images/seed; choose a new split path")
    else:
        split_path.parent.mkdir(parents=True, exist_ok=True)
        with split_path.open("x", encoding="utf-8") as stream:
            json.dump(persisted, stream, indent=2)
            stream.write("\n")
    metadata = {"manifest": str(manifest), "manifest_sha256": persisted["manifest_sha256"],
                "split_file": str(split_path), "split_sha256": file_sha256(split_path),
                "split_policy": SPLIT_POLICY, "seed": seed, "parser_versions": sorted(versions),
                "rows": len(assignments), "review_rows_retained": review_rows,
                "rows_without_active_labels_retained": zero_active,
                "split_rows": {name: len(records) for name, records in splits.items()},
                "class_counts": coverage,
                "valid_counts": {name: {h: sum(labels[h] is not None for _, labels in records)
                                         for h in HEAD_NAMES} for name, records in splits.items()}}
    return splits, metadata


def phase2_weights(train_records):
    """Train-only CE inverse-frequency weights capped at 10, color neg/pos at 20."""
    ce = compute_class_weights(train_records, ("category", "pattern"), max_weight=10., allow_empty=True)
    positives = torch.zeros(len(CLASS_NAMES["color"]), dtype=torch.float32)
    count = 0
    for _, targets in train_records:
        if targets["color"] is not None:
            positives += torch.tensor(targets["color"], dtype=torch.float32)
            count += 1
    pos_weight = torch.zeros_like(positives)
    observed = positives > 0
    pos_weight[observed] = ((count - positives[observed]) / positives[observed]).clamp(1., 20.)
    return ce, pos_weight


def frozen_snapshot(model):
    return {key: value.detach().cpu().clone() for key, value in model.state_dict().items()
            if any(key.startswith(f"heads.{head}.") for head in FROZEN_HEADS)}


def assert_frozen_unchanged(model, before):
    current = model.state_dict()
    for key, value in before.items():
        if not torch.equal(current[key].detach().cpu(), value):
            raise RuntimeError(f"Frozen head changed: {key}")
    for head in FROZEN_HEADS:
        if any(p.requires_grad for p in model.heads[head].parameters()):
            raise RuntimeError(f"Frozen head requires gradients: {head}")


def selection_score(metrics):
    color = metrics["heads"]["color"]["macro_f1"]
    scores = [color]
    for head in ("category", "pattern"):
        supported = [item["accuracy"] for item in metrics["heads"][head]["per_class"].values()
                     if item["labeled_samples"] > 0]
        scores.append(sum(supported) / len(supported) if supported else None)
    if any(score is None for score in scores):
        raise ValueError("Model selection requires validation labels for all three active heads")
    return sum(scores) / len(scores)
