"""Statistics for derived caption labels, independent of the training engine."""

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES
from feature_extraction.training.caption_parser import PARSER_VERSION


def audit_rows(rows, total_dataset_rows=None):
    counts = {h: {label: 0 for label in CLASS_NAMES[h]} for h in HEAD_NAMES}
    valid = dict.fromkeys(HEAD_NAMES, 0)
    buckets = {"zero": 0, "one": 0, "two": 0, "three_or_more": 0}
    for row in rows:
        n = sum(row["valid"].values())
        buckets["zero" if n == 0 else "one" if n == 1 else "two" if n == 2 else "three_or_more"] += 1
        for head in HEAD_NAMES:
            if row["valid"][head]:
                valid[head] += 1
                labels = row["labels"][head] if head == "color" else [row["labels"][head]]
                for label in labels:
                    counts[head][label] += 1
    return {"parser_version": PARSER_VERSION, "total_dataset_rows": total_dataset_rows,
            "processed_rows": len(rows),
            "successfully_processed_rows": sum(not row.get("processing_error") for row in rows),
            "processing_error_rows": sum(bool(row.get("processing_error")) for row in rows),
            "review_required_rows": sum(row["review_required"] for row in rows),
            "per_head_valid_counts": valid, "per_class_counts": counts,
            "half_sleeve_count": counts["sleeve_length"]["half"],
            "embroidered_count": counts["pattern"]["embroidered"],
            "other_fashion_count": counts["category"]["other_fashion"],
            "valid_head_distribution": buckets,
            "missing_images": [row["image_identifier"] for row in rows if row.get("image_status") == "missing"]}
