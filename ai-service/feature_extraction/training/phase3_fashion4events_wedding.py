"""Local wedding-only collection with byte deduplication and photo-group priority."""

import argparse
from collections import defaultdict, deque
import csv
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile
import uuid

from PIL import Image

from feature_extraction.training.phase3_hf_fashion import validate_image

SOURCE = "Fashion4Events"
EVENT_CLASSES = ('concert', 'graduation', 'meeting', 'mountain-trip', 'picnic',
                 'sea-holiday', 'ski-holiday', 'wedding', 'conference', 'exhibition',
                 'fashion', 'protest', 'sport', 'theater-dance')
ANNOTATION_SCHEMA = 'source_path,event_class_id,garment_class_id'
OTHER_HEADS = ("season", "color", "category", "sleeve_length", "pattern")
OUTPUTS = ("fashion4events_wedding", "fashion4events_wedding_manifest.csv", "fashion4events_wedding_audit.json")
FIELDS = ("image_name", "source_dataset", "source_path", "source_id", "source_event_class",
          "occasion", "occasion_valid", "season", "season_valid", "color", "color_valid",
          "category", "category_valid", "sleeve_length", "sleeve_length_valid", "pattern", "pattern_valid",
          "needs_manual_review", "source_photo_group", "source_row_index", "source_local_path", "image_sha256",
          "source_garment_class", "annotation_schema")


def map_event(event_id):
    return "wedding" if type(event_id) is int and event_id == 7 else None


def read_labels(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as stream:
        for index, values in enumerate(csv.reader(stream)):
            if len(values) != 3 or not values[0].strip():
                raise ValueError(f"Invalid label row {index + 1}: expected {ANNOTATION_SCHEMA}")
            try:
                event_id = int(values[1].strip())
                garment_id = int(values[2].strip())
            except ValueError as exc:
                raise ValueError(f"Invalid class at row {index + 1}") from exc
            if not 0 <= event_id < len(EVENT_CLASSES) or not 0 <= garment_id < 13:
                raise ValueError(f"Class out of range at row {index + 1}")
            # Labels come from the annotation, never from a directory name.
            yield {"source_path": values[0].strip(), "source_event_class": event_id,
                   "source_garment_class": garment_id, "source_row_index": index}


def photo_group(path):
    return re.sub(r"-\d+$", "", Path(path).stem)


class LocalImages:
    def __init__(self, root):
        self.root = Path(root).resolve()
        if not self.root.is_dir():
            raise FileNotFoundError(f"Extracted valid directory not found: {self.root}")
        self.basenames = defaultdict(list)
        def fail(error):
            raise error
        for directory, _, files in os.walk(self.root, onerror=fail):
            for name in files:
                self.basenames[name].append(Path(directory) / name)

    def resolve(self, original):
        if "\x00" in original:
            raise ValueError("Unsafe source path")
        parts = PurePosixPath(original.replace("\\", "/")).parts
        if not parts or ".." in parts:
            raise ValueError("Unsafe source path traversal")
        valid_indices = [i for i, part in enumerate(parts) if part == "valid"]
        relative = parts[valid_indices[-1] + 1:] if valid_indices else ()
        if not relative and not PurePosixPath(original.replace("\\", "/")).is_absolute() and ":" not in original:
            relative = parts
        if relative:
            if any(":" in part for part in relative):
                raise ValueError("Unsafe relative path")
            candidate = (self.root.joinpath(*relative)).resolve()
            if not candidate.is_relative_to(self.root):
                raise ValueError("Resolved path escapes extracted images")
            if candidate.is_file():
                return candidate
        matches = self.basenames.get(parts[-1], [])
        if len(matches) > 1:
            raise ValueError("Ambiguous basename; no safe local path resolution")
        if not matches:
            return None
        candidate = matches[0].resolve()
        if not candidate.is_relative_to(self.root):
            raise ValueError("Resolved path escapes extracted images")
        return candidate


def check_outputs(root, overwrite):
    root = Path(root).resolve()
    for name in OUTPUTS:
        path = root / name
        if path.is_symlink() or path.resolve().parent != root:
            raise ValueError("Unsafe output path")
        if path.exists() and not overwrite:
            raise FileExistsError("Wedding outputs already exist; choose another root or explicitly use --overwrite")
    return root


def collect(label_file, image_root, output_root, *, target=500, seed=42, overwrite=False, progress=None):
    if target < 1:
        raise ValueError("Target must be positive")
    root = check_outputs(output_root, overwrite)
    images = LocalImages(image_root)
    if root.is_relative_to(images.root):
        raise ValueError("Outputs must be outside the extracted source images")
    label_file = Path(label_file).resolve()
    label_digest = hashlib.sha256(label_file.read_bytes()).hexdigest()
    groups = defaultdict(list)
    missing, path_errors, invalid = [], [], []
    seen_paths, source_hashes = set(), set()
    total = wedding = duplicate_rows = duplicate_bytes = 0
    for row in read_labels(label_file):
        total += 1
        if map_event(row["source_event_class"]) is None:
            continue
        wedding += 1
        try:
            path = images.resolve(row["source_path"])
        except ValueError as exc:
            path_errors.append({**row, "error": str(exc)})
            continue
        if path is None:
            missing.append(row)
            continue
        if path in seen_paths:
            duplicate_rows += 1
            continue
        seen_paths.add(path)
        try:
            raw = path.read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            extension = validate_image(raw)
        except (ValueError, OSError, Image.DecompressionBombError) as exc:
            invalid.append({**row, "error": str(exc)})
            continue
        duplicate_bytes += digest in source_hashes
        source_hashes.add(digest)
        group = photo_group(path)
        groups[group].append({**row, "path": path, "digest": digest, "extension": extension,
                              "source_photo_group": group, "size": len(raw)})
        if progress and wedding % 5000 == 0:
            progress({"wedding_rows_checked": wedding})
    rank = lambda value: hashlib.sha256(f"{seed}:{value}".encode()).hexdigest()
    group_order = sorted(groups, key=lambda group: (rank(group), group))
    queues = {group: deque(sorted(groups[group], key=lambda row: (rank(row["path"].relative_to(images.root).as_posix()), str(row["path"])))) for group in group_order}
    chosen, selected_hashes = [], set()
    selection_duplicates = 0
    # Round-robin groups: every group gets a chance before any second view.
    while len(chosen) < target:
        added = False
        for group in group_order:
            while queues[group]:
                row = queues[group].popleft()
                if row["digest"] in selected_hashes:
                    selection_duplicates += 1
                    continue
                chosen.append(row)
                selected_hashes.add(row["digest"])
                added = True
                break
            if len(chosen) == target:
                break
        if not added:
            break
    chosen_groups = {row["source_photo_group"] for row in chosen}
    deferred_views = {(group, row["digest"]) for group in chosen_groups for row in groups[group]
                      if row["digest"] not in selected_hashes}
    saved_size = sum(row["size"] for row in chosen)
    report = {"collector_version": 2, "annotation_schema": ANNOTATION_SCHEMA,
              "event_classes": EVENT_CLASSES, "training_approved": False,
              "source_dataset": SOURCE, "source_split": "valid",
              "label_file": str(label_file), "label_file_sha256": label_digest, "image_root": str(images.root),
              "seed": seed, "target": target, "total_label_rows": total, "wedding_label_rows": wedding,
              "images_saved": len(chosen), "shortage": max(0, target - len(chosen)),
              "missing_local_image_count": len(missing), "missing_local_images": missing,
              "path_resolution_error_count": len(path_errors), "path_resolution_errors": path_errors,
              "invalid_image_count": len(invalid), "invalid_images": invalid,
              "duplicate_annotation_rows": duplicate_rows, "duplicate_image_bytes_in_wedding_pool": duplicate_bytes,
              "selection_duplicate_skips": selection_duplicates, "additional_views_skipped": len(deferred_views),
              "available_unique_image_hashes": len(source_hashes), "available_photo_groups": len(groups),
              "selected_photo_groups": len(chosen_groups), "selected_additional_views": len(chosen) - len(chosen_groups),
              "saved_image_bytes": saved_size, "valid_heads": {"occasion": len(chosen), **{h: 0 for h in OTHER_HEADS}},
              "notes": ["Only event class 7 maps to wedding; every other head stays masked",
                        "Missing/invalid/path-error counts cover all wedding annotations, not other events",
                        "Duplicate byte count covers distinct local files in the full wedding pool",
                        "additional_views_skipped counts unselected distinct hashes in represented photo groups",
                        "Photo groups remove only a trailing -N view suffix; no perceptual similarity model",
                        "All selected images need visual review; source valid is not a final Phase 3 split"]}
    root.mkdir(parents=True, exist_ok=True)
    lock = root / ".fashion4events_wedding.lock"
    with lock.open("x") as stream:
        stream.write("wedding collection in progress")
    try:
        with tempfile.TemporaryDirectory(prefix=".fashion4events_stage_", dir=root) as temporary:
            stage = Path(temporary).resolve()
            if stage.parent != root:
                raise ValueError("Unexpected staging path")
            (stage / OUTPUTS[0]).mkdir()
            with (stage / OUTPUTS[1]).open("x", newline="", encoding="utf-8") as stream:
                writer = csv.DictWriter(stream, fieldnames=FIELDS)
                writer.writeheader()
                for row in chosen:
                    raw = row["path"].read_bytes()
                    if hashlib.sha256(raw).hexdigest() != row["digest"]:
                        raise RuntimeError("Source image changed during collection")
                    filename = row["digest"] + row["extension"]
                    with (stage / OUTPUTS[0] / filename).open("xb") as image_file:
                        image_file.write(raw)
                    item = {field: "" for field in FIELDS}
                    item.update(image_name=f"{OUTPUTS[0]}/{filename}", source_dataset=SOURCE,
                                source_path=row["source_path"], source_id=row["path"].relative_to(images.root).as_posix(),
                                source_event_class=7, occasion="wedding", occasion_valid=1, needs_manual_review=1,
                                source_photo_group=row["source_photo_group"], source_row_index=row["source_row_index"],
                                source_local_path=str(row["path"]), image_sha256=row["digest"],
                                source_garment_class=row['source_garment_class'], annotation_schema=ANNOTATION_SCHEMA)
                    item.update({head + "_valid": 0 for head in OTHER_HEADS})
                    writer.writerow(item)
            if hashlib.sha256(label_file.read_bytes()).hexdigest() != label_digest:
                raise RuntimeError("Label file changed during collection")
            check_outputs(root, overwrite)
            backup, moved, published = None, [], []
            try:
                if overwrite and any((root / name).exists() for name in OUTPUTS):
                    backup = root / (".fashion4events_backup_" + uuid.uuid4().hex)
                    backup.mkdir()
                    report["previous_outputs_backup"] = str(backup)
                    for name in OUTPUTS:
                        if (root / name).exists():
                            (root / name).rename(backup / name)
                            moved.append(name)
                (stage / OUTPUTS[2]).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
                for name in OUTPUTS:
                    (stage / name).rename(root / name)
                    published.append(name)
            except BaseException:
                for name in reversed(published):
                    (root / name).rename(stage / name)
                for name in moved:
                    (backup / name).rename(root / name)
                raise
        return report
    finally:
        lock.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--labels", default="../datasets/fashion4events/valid.txt")
    parser.add_argument("--image-root", default="../datasets/fashion4events/valid")
    parser.add_argument("--output-root", default="../datasets/phase3_rewearx")
    parser.add_argument("--target", type=int, default=500)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    report = collect(args.labels, args.image_root, args.output_root, target=args.target, seed=args.seed,
                     overwrite=args.overwrite, progress=lambda info: print(json.dumps(info), flush=True))
    # Full missing-path lists are in the JSON audit rather than flooding stdout.
    print(json.dumps({k: v for k, v in report.items() if k not in ("missing_local_images", "path_resolution_errors", "invalid_images")}, indent=2))


if __name__ == "__main__":
    main()
