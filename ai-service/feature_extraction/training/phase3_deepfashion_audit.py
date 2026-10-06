"""Audit DeepFashion labels and local image availability; never train or copy."""

import argparse
from collections import Counter
import csv
import json
import os
from pathlib import Path

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES
from feature_extraction.training.adapters.deepfashion_attribute import ADAPTER_VERSION, CATEGORY_MAP, DeepFashionAttributeAdapter


def audit_dataset(root, output, *, progress=None):
    adapter = DeepFashionAttributeAdapter(root)
    output = Path(output).resolve()
    if output.is_relative_to(adapter.root):
        raise ValueError("Audit output must be outside the source dataset")
    image_root = adapter.root / "img"
    if not image_root.is_dir():
        raise FileNotFoundError(f"Image directory not found: {image_root}")
    found = set()
    for directory, _, filenames in os.walk(image_root):
        for name in filenames:
            if Path(name).suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
                found.add((Path(directory) / name).relative_to(adapter.root).as_posix())
    # A fresh folder avoids silently replacing any existing audit or source file.
    output.mkdir(parents=True, exist_ok=False)
    counts = {head: {label: 0 for label in CLASS_NAMES[head]} for head in HEAD_NAMES}
    annotation_counts = {head: dict(values) for head, values in counts.items()}
    valid = Counter({head: 0 for head in HEAD_NAMES})
    annotation_valid = valid.copy()
    splits, existing_splits, unsupported = Counter(), Counter(), Counter()
    reasons_count = Counter()
    missing = conflicts = existing_conflicts = useful = total = 0
    seen = set()
    with (output / "missing_images.csv").open("x", newline="", encoding="utf-8") as missing_file, \
         (output / "review.csv").open("x", newline="", encoding="utf-8") as review_file:
        missing_writer = csv.writer(missing_file)
        review_writer = csv.writer(review_file)
        missing_writer.writerow(["image_name", "split"])
        review_writer.writerow(["image_name", "split", "image_exists", "reasons", "evidence"])
        for row in adapter:
            total += 1
            seen.add(row["image_name"])
            exists = row["image_name"] in found
            splits[row["split"]] += 1
            if exists:
                existing_splits[row["split"]] += 1
            else:
                missing += 1
                missing_writer.writerow([row["image_name"], row["split"]])
            conflict = "conflicting_pattern" in row["review_reasons"]
            conflicts += conflict
            existing_conflicts += conflict and exists
            useful += exists and any(row["valid"].values())
            if not row["valid"]["category"]:
                unsupported[row["source_category"]] += 1
            reasons = row["review_reasons"] + ([] if exists else ["missing_image"])
            reasons_count.update(reasons)
            if reasons:
                review_writer.writerow([row["image_name"], row["split"], int(exists), json.dumps(reasons), json.dumps(row["evidence"])])
            for head, label in row["labels"].items():
                if label is not None:
                    annotation_valid[head] += 1
                    annotation_counts[head][label] += 1
                    if exists:
                        valid[head] += 1
                        counts[head][label] += 1
            if progress and total % 50000 == 0:
                progress(total)
    report = {"adapter_version": ADAPTER_VERSION, "dataset_root": str(adapter.root),
              "taxonomy": CLASS_NAMES, "annotation_images": total, "total_images_found": len(found),
              "annotated_images_found": total - missing, "unannotated_images_found": len(found - seen),
              "missing_images": missing, "useful_images_found": useful,
              "valid_heads": dict(valid), "class_counts": counts,
              "annotation_valid_heads": dict(annotation_valid), "annotation_class_counts": annotation_counts,
              "conflicting_pattern_labels": conflicts, "conflicting_pattern_labels_images_found": existing_conflicts,
              "split_counts": {s: splits[s] for s in ("train", "val", "test", "unassigned")},
              "split_counts_images_found": {s: existing_splits[s] for s in ("train", "val", "test", "unassigned")},
              "official_partition_used": adapter.partitions is not None,
              "unsupported_category_counts": dict(sorted(unsupported.items())), "review_reason_counts": dict(reasons_count),
              "notes": ["class_counts and valid_heads count only existing images; annotation_* includes missing images",
                        "Only positive (1) attributes supervise; -1 and 0 never imply a class",
                        "Image existence inventory only; pixels are not decoded or copied",
                        "Official split preserved; no regrouping or leakage correction",
                        "README states Cape was merged into Dress; source annotations may therefore contain category noise"]}
    mappings = {"adapter_version": ADAPTER_VERSION,
                "categories": [{**row, "source_id": i + 1, "rewearx": CATEGORY_MAP.get(row["name"])} for i, row in enumerate(adapter.categories)],
                "attributes": [{**row, "source_id": i + 1, "mapping": adapter.attribute_mappings[i]} for i, row in enumerate(adapter.attributes)]}
    for name, content in (("audit.json", report), ("mappings.json", mappings)):
        with (output / name).open("x", encoding="utf-8") as stream:
            json.dump(content, stream, indent=2)
            stream.write("\n")
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", required=True)
    parser.add_argument("--output", required=True, help="New audit directory outside the dataset; never overwrites")
    args = parser.parse_args(argv)
    report = audit_dataset(args.dataset_root, args.output,
                           progress=lambda n: print(f"Audited {n:,} annotation rows", flush=True))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
