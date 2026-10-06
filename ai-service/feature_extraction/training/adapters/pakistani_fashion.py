"""Local caption dataset -> reviewable CSV manifests. Never imports training/model code."""

import argparse
import csv
import hashlib
from itertools import islice
import json
from pathlib import Path

from feature_extraction.clothing_config import HEAD_NAMES
from feature_extraction.training.caption_parser import parse_caption
from feature_extraction.training.phase2_audit import audit_rows

SUPPORTED = {".csv", ".jsonl", ".parquet", ".arrow"}
FIELDS = ["source_row", "source_file", "image_identifier", "image_path", "image_status",
          "original_caption", "normalized_caption", "parsed_colors", "color",
          "category", "pattern", "sleeve_length", "occasion", "season",
          *[f"{h}_valid" for h in HEAD_NAMES], "review_required", "review_reason",
          "evidence", "parser_version", "processing_error"]


def inspect_source(dataset_path, split=None):
    path = Path(dataset_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Dataset path does not exist: {path}")
    selected = path / split if split and path.is_dir() else path
    if split and (not path.is_dir() or not selected.is_dir() or selected.parent != path):
        raise ValueError("--split must name a direct existing dataset subdirectory")
    files = sorted(p for p in selected.rglob("*") if p.suffix.lower() in SUPPORTED) if selected.is_dir() else [selected]
    if not files or any(p.suffix.lower() not in SUPPORTED for p in files):
        raise ValueError("Expected a local CSV, JSONL, Parquet, Arrow file or directory containing them")
    if len(files) > 1 and not (len({p.suffix.lower() for p in files}) == 1
                              and files[0].suffix.lower() in (".parquet", ".arrow")
                              and len({p.parent for p in files}) == 1):
        raise ValueError("Ambiguous dataset layout. Select a specific annotation file or split directory: "
                         + ", ".join(str(p) for p in files[:10]))
    return files


def _arrow():
    try:
        import pyarrow
        return pyarrow
    except ImportError as exc:
        raise RuntimeError("Parquet/Arrow input requires pyarrow in the active environment; no download was attempted") from exc


def source_rows(files):
    """Stream annotation rows; embedded image bytes are not decoded by this reader."""
    for path in files:
        suffix = path.suffix.lower()
        if suffix == ".csv":
            with path.open(encoding="utf-8-sig", newline="") as stream:
                reader = csv.DictReader(stream)
                if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)):
                    raise ValueError(f"Missing/duplicate CSV headers: {path}")
                for row in reader:
                    yield path, row
        elif suffix == ".jsonl":
            with path.open(encoding="utf-8-sig") as stream:
                for line in stream:
                    if line.strip():
                        try:
                            row = json.loads(line)
                        except json.JSONDecodeError:
                            row = {"_source_error": "invalid_json", "_raw": line.rstrip("\r\n")}
                        yield path, row
        elif suffix == ".parquet":
            _arrow()
            import pyarrow.parquet as pq
            for batch in pq.ParquetFile(path).iter_batches(batch_size=1):
                for row in batch.to_pylist():
                    yield path, row
        else:
            pa = _arrow()
            with pa.memory_map(str(path), "r") as source:
                try:
                    reader = pa.ipc.open_stream(source)
                except pa.ArrowInvalid:
                    source.seek(0)
                    reader = pa.ipc.open_file(source)
                batches = (reader.get_batch(i) for i in range(reader.num_record_batches)) if hasattr(reader, "num_record_batches") else reader
                for batch in batches:
                    for i in range(batch.num_rows):
                        yield path, batch.slice(i, 1).to_pylist()[0]


def _column(row, explicit, candidates, kind):
    if explicit:
        if explicit not in row:
            raise ValueError(f"missing_{kind}_column:{explicit}")
        return explicit
    present = [name for name in candidates if name in row]
    if len(present) != 1:
        raise ValueError(f"ambiguous_or_missing_{kind}_column:" + "|".join(present))
    return present[0]


def _image(value, source, image_root, output_dir):
    embedded = value.get("bytes") if isinstance(value, dict) else None
    name = value.get("path") if isinstance(value, dict) else value
    identifier = str(name or "embedded_image")
    if embedded:
        if not isinstance(embedded, bytes):
            raise ValueError("embedded_image_must_be_bytes")
        # Preserve original encoded bytes; derived files never replace source images.
        suffix = Path(str(name)).suffix.lower() if name else ""
        if suffix not in (".jpg", ".jpeg", ".png", ".webp"):
            suffix = ".img"
        destination = output_dir / "images" / (hashlib.sha256(embedded).hexdigest() + suffix)
        destination.parent.mkdir(exist_ok=True)
        if not destination.exists():
            destination.write_bytes(embedded)
        return identifier, str(destination), "extracted"
    if not isinstance(name, str) or not name.strip() or "://" in name:
        return identifier, "", "missing"
    root = image_root or source.parent
    resolved = (root / name).resolve()
    return identifier, str(resolved), "exists" if resolved.is_file() else "missing"


def _flat(row):
    labels = row["labels"]
    return {**{key: row.get(key, "") for key in FIELDS},
            "parsed_colors": json.dumps(labels["color"] or [], ensure_ascii=False),
            "color": "|".join(labels["color"] or []),
            **{head: labels[head] or "" for head in HEAD_NAMES if head != "color"},
            **{f"{head}_valid": int(row["valid"][head]) for head in HEAD_NAMES},
            "review_required": int(row["review_required"]),
            "review_reason": json.dumps(row["review_reasons"], ensure_ascii=False),
            "evidence": json.dumps(row["evidence"], ensure_ascii=False)}


def generate_manifest(dataset_path, output_dir, *, limit=100, image_root=None,
                      image_column=None, caption_column=None, split=None):
    if limit is not None and limit < 1:
        raise ValueError("limit must be positive")
    files = inspect_source(dataset_path, split)
    output = Path(output_dir).resolve()
    source_root = Path(dataset_path).resolve()
    source_root = source_root if source_root.is_dir() else source_root.parent
    if output == source_root or output.is_relative_to(source_root):
        raise ValueError("Output must be outside the original dataset directory")
    if output.exists() and any(output.iterdir()):
        raise FileExistsError("Choose a new/empty output directory; existing review files are never overwritten")
    output.mkdir(parents=True, exist_ok=True)
    image_root = Path(image_root).resolve() if image_root else None
    rows = []
    iterator = source_rows(files)
    selected = iterator if limit is None else islice(iterator, limit)
    try:
        for index, (source, raw) in enumerate(selected, 1):
            caption = ""
            image_identifier, image_path, image_status = "", "", "missing"
            error = ""
            try:
                if not isinstance(raw, dict) or raw.get("_source_error") or None in raw:
                    raise ValueError("malformed_source_row")
                column = _column(raw, caption_column, ("caption", "description", "text"), "caption")
                caption = raw[column]
                column = _column(raw, image_column, ("image", "image_path", "filename", "file_name"), "image")
                image_identifier, image_path, image_status = _image(raw[column], source, image_root, output)
                parsed = parse_caption(caption)
            except (ValueError, TypeError, OSError) as exc:
                error = f"{type(exc).__name__}:{exc}"
                parsed = parse_caption(caption)
                parsed["review_reasons"].append("source_error:" + error)
                # Preserve malformed input for manual recovery, not silent loss.
                if not caption:
                    caption = json.dumps(raw, ensure_ascii=False, default=lambda v: "<binary>" if isinstance(v, bytes) else str(v))
            if image_status == "missing" or error:
                parsed["valid"] = dict.fromkeys(HEAD_NAMES, False)
                parsed["labels"] = dict.fromkeys(HEAD_NAMES, None)
                parsed["review_reasons"].append("missing_image" if image_status == "missing" else "unusable_source_row")
            parsed["review_required"] = bool(parsed["review_reasons"])
            rows.append({**parsed, "source_row": index, "source_file": str(source),
                         "image_identifier": image_identifier, "image_path": image_path, "image_status": image_status,
                         "original_caption": caption if isinstance(caption, str) else json.dumps(caption, ensure_ascii=False),
                         "processing_error": error})
    finally:
        iterator.close()
    total = None
    if all(path.suffix.lower() == ".parquet" for path in files):
        import pyarrow.parquet as pq
        total = sum(pq.ParquetFile(path).metadata.num_rows for path in files)
    elif limit is None or len(rows) < limit:
        total = len(rows)
    audit = audit_rows(rows, total)
    audit.update(source_files=[str(p) for p in files], requested_limit=limit,
                 full_dataset_requested=limit is None,
                 scope="all counts below describe processed rows only",
                 total_row_count_note="null means unknown without scanning beyond the preview",
                 image_validation="existence/embedded-byte extraction only; images are not decoded")
    for name, selected_rows in (("phase2_manifest.csv", rows),
                                ("phase2_review.csv", [row for row in rows if row["review_required"]])):
        with (output / name).open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(_flat(row) for row in selected_rows)
    (output / "phase2_audit.json").write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return audit


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-path", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--image-root")
    parser.add_argument("--image-column")
    parser.add_argument("--caption-column")
    parser.add_argument("--split", help="Select a local split subdirectory; does not assign training splits")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--limit", type=int, default=100)
    group.add_argument("--full", action="store_true", help="Explicitly process all rows, only after manual review")
    args = parser.parse_args(argv)
    report = generate_manifest(args.dataset_path, args.output_dir,
                              limit=None if args.full else args.limit, image_root=args.image_root,
                              image_column=args.image_column, caption_column=args.caption_column, split=args.split)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
