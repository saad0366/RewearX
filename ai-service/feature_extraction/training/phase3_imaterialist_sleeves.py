"""Collect a bounded, deterministic sleeve-only iMaterialist subset; never train."""

import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import tempfile
import uuid

from PIL import Image

from feature_extraction.training.phase3_hf_fashion import image_bytes, stable_id, validate_image

SOURCE = "Marqo/iMaterialist"
SLEEVE_MAP = {"Long Sleeved": "full", "Short Sleeves": "short", "Sleeveless": "sleeveless"}
CLASSES = ("sleeveless", "short", "full")
OTHER_HEADS = ("color", "occasion", "season", "category", "pattern")
OUTPUTS = ("imaterialist_sleeves", "imaterialist_sleeves_manifest.csv", "imaterialist_sleeves_audit.json")
FIELDS = ("image_name", "source_dataset", "source_id", "source_row_index", "source_sleeve",
          "sleeve_length", "sleeve_length_valid", "color", "color_valid", "occasion", "occasion_valid",
          "season", "season_valid", "category", "category_valid", "pattern", "pattern_valid",
          "needs_manual_review", "image_sha256")


def map_sleeve(value):
    return SLEEVE_MAP.get(value) if isinstance(value, str) else None


def check_outputs(output_root, overwrite=False):
    root = Path(output_root).resolve()
    for name in OUTPUTS:
        path = root / name
        if path.is_symlink() or path.resolve().parent != root:
            raise ValueError("Outputs must be direct non-symlink children of output root")
        if path.exists() and not overwrite:
            raise FileExistsError("iMaterialist sleeve outputs exist; choose a different root or explicitly use --overwrite")
    return root


def collect(rows, output_root, *, target=200, seed=42, max_rows=10000, max_stream_bytes=1024**3,
            batch_size=32, overwrite=False, revision=None, progress=None):
    if min(target, max_rows, max_stream_bytes, batch_size) < 1:
        raise ValueError("Targets and limits must be positive")
    root = check_outputs(output_root, overwrite)
    root.mkdir(parents=True, exist_ok=True)
    lock = root / ".imaterialist_sleeves.lock"
    with lock.open("x") as stream:
        stream.write("sleeve collection in progress")
    try:
        counts = Counter({label: 0 for label in CLASSES})
        observed, ignored = Counter(), Counter()
        selected, errors = [], []
        ids, hashes = set(), set()
        scanned = duplicates = received = saved = 0
        stop = "max_rows"
        iterator = iter(rows)
        with tempfile.TemporaryDirectory(prefix=".imaterialist_stage_", dir=root) as temporary:
            stage = Path(temporary).resolve()
            if stage.parent != root:
                raise ValueError("Unexpected staging path")
            images = stage / OUTPUTS[0]
            images.mkdir()
            exhausted = False
            while scanned < max_rows and received < max_stream_bytes:
                batch = []
                for _ in range(min(batch_size, max_rows - scanned)):
                    try:
                        row = next(iterator)
                    except StopIteration:
                        exhausted = True
                        break
                    index = scanned
                    scanned += 1
                    raw_value = row.get("image")
                    raw_value = raw_value.get("bytes") if isinstance(raw_value, dict) else None
                    received += len(raw_value) if isinstance(raw_value, (bytes, bytearray)) else 0
                    source_sleeve = row.get("sleeve")
                    label = map_sleeve(source_sleeve)
                    if label is None:
                        ignored[str(source_sleeve)] += 1
                    else:
                        observed[label] += 1
                        if counts[label] < target:
                            identifier = stable_id({"id": row.get("item_ID")})
                            priority = hashlib.sha256(f"{seed}:{index}:{identifier}".encode()).hexdigest()
                            batch.append((priority, index, identifier, label, row))
                    if received >= max_stream_bytes:
                        break
                # One label per image: independent per-class quotas remain exact.
                for _, index, identifier, label, row in sorted(batch):
                    if counts[label] >= target:
                        continue
                    if identifier is not None and identifier in ids:
                        duplicates += 1
                        continue
                    try:
                        raw = image_bytes(row)
                        digest = hashlib.sha256(raw).hexdigest()
                        if digest in hashes:
                            duplicates += 1
                            if identifier is not None:
                                ids.add(identifier)
                            continue
                        extension = validate_image(raw)
                    except (ValueError, OSError, Image.DecompressionBombError) as exc:
                        errors.append({"source_row_index": index, "source_id": identifier, "error": str(exc)})
                        continue
                    name = digest + extension
                    with (images / name).open("xb") as stream:
                        stream.write(raw)
                    hashes.add(digest)
                    if identifier is not None:
                        ids.add(identifier)
                    counts[label] += 1
                    saved += len(raw)
                    item = {field: "" for field in FIELDS}
                    item.update(image_name=f"{OUTPUTS[0]}/{name}", source_dataset=SOURCE,
                                source_id=identifier if identifier is not None else "sha256:" + digest,
                                source_row_index=index, source_sleeve=row["sleeve"], sleeve_length=label,
                                sleeve_length_valid=1, needs_manual_review=1, image_sha256=digest)
                    item.update({head + "_valid": 0 for head in OTHER_HEADS})
                    selected.append(item)
                if progress and (selected or scanned % 256 == 0):
                    progress({"rows_scanned": scanned, "images_saved": len(selected), "counts": dict(counts)})
                if all(counts[label] >= target for label in CLASSES):
                    stop = "targets_met"
                    break
                if exhausted:
                    stop = "dataset_exhausted"
                    break
                if received >= max_stream_bytes:
                    stop = "stream_image_byte_limit"
                    break
            selected.sort(key=lambda row: row["source_row_index"])
            audit = {"collector_version": 1, "source_dataset": SOURCE, "source_split": "data", "revision": revision,
                     "seed": seed, "target_per_class": target, "batch_size": batch_size,
                     "selection": "source-order bounded batches; sha256(seed:original_row:item_ID) ordering within batch",
                     "max_rows": max_rows, "max_stream_image_bytes": max_stream_bytes, "rows_scanned": scanned,
                     "images_saved": len(selected), "counts": dict(counts),
                     "shortages": {label: max(0, target - counts[label]) for label in CLASSES},
                     "shortage_scope": "saved unique images from bounded scan, not a claim about unseen rows",
                     "observed_mapped_rows": dict(observed), "ignored_sleeve_values": dict(ignored),
                     "duplicates_skipped": duplicates, "invalid_images": errors, "stop_reason": stop,
                     "streamed_image_bytes": received, "saved_image_bytes": saved,
                     "valid_heads": {"sleeve_length": len(selected), **{head: 0 for head in OTHER_HEADS}},
                     "notes": ["Only three exact sleeve labels are trusted; half/three_quarter are unavailable",
                               "All rows require manual visual review of source sleeve labels",
                               "source_row_index is zero-based in the pinned unshuffled data stream",
                               "Byte limit counts yielded encoded images, not HTTP/Parquet read-ahead; one image may cross it",
                               "No full snapshot, eager dataset cache, training, or checkpoint access"]}
            with (stage / OUTPUTS[1]).open("x", newline="", encoding="utf-8") as stream:
                writer = csv.DictWriter(stream, fieldnames=FIELDS)
                writer.writeheader()
                writer.writerows(selected)
            check_outputs(root, overwrite)
            backup = None
            moved, published = [], []
            try:
                if overwrite and any((root / name).exists() for name in OUTPUTS):
                    backup = root / (".imaterialist_backup_" + uuid.uuid4().hex)
                    backup.mkdir()
                    audit["previous_outputs_backup"] = str(backup)
                    for name in OUTPUTS:
                        if (root / name).exists():
                            (root / name).rename(backup / name)
                            moved.append(name)
                (stage / OUTPUTS[2]).write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
                for name in OUTPUTS:
                    (stage / name).rename(root / name)
                    published.append(name)
            except BaseException:
                for name in reversed(published):
                    (root / name).rename(stage / name)
                for name in moved:
                    (backup / name).rename(root / name)
                raise
        return audit
    finally:
        lock.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", default="../datasets/phase3_rewearx")
    parser.add_argument("--target-per-class", type=int, default=200)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-rows", type=int, default=10000)
    parser.add_argument("--max-stream-mib", type=int, default=1024)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--revision", help="Dataset revision; resolved to a commit and recorded")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args(argv)
    check_outputs(args.output_root, args.overwrite)  # No network on collision.
    if min(args.target_per_class, args.max_rows, args.max_stream_mib, args.batch_size) < 1:
        parser.error("Targets and bounds must be positive")
    from datasets import Image as HFImage, load_dataset
    from huggingface_hub import HfApi
    revision = HfApi().dataset_info(SOURCE, revision=args.revision).sha
    print(json.dumps({"source": SOURCE, "revision": revision, "streaming": True}), flush=True)
    dataset = load_dataset(SOURCE, split="data", streaming=True, revision=revision,
                           columns=["item_ID", "sleeve", "image"], batch_size=args.batch_size)
    dataset = dataset.cast_column("image", HFImage(decode=False))
    report = collect(dataset, args.output_root, target=args.target_per_class, seed=args.seed,
                     max_rows=args.max_rows, max_stream_bytes=args.max_stream_mib * 1024**2,
                     batch_size=args.batch_size, overwrite=args.overwrite, revision=revision,
                     progress=lambda info: print(json.dumps(info), flush=True))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
