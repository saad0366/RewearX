"""Bounded streaming collection of trusted season/occasion labels; never trains."""

import argparse
from collections import Counter
import csv
import hashlib
from io import BytesIO, StringIO
import json
import os
from pathlib import Path
import tempfile
import uuid

from PIL import Image

SOURCE = "ktrinh38/fashion-dataset"
PINNED_REVISION = "75545fc28dc92e3c9b03c0c3bbbe6fd526c43bd7"
SEASONS = {"Summer": "summer", "Winter": "winter"}
OCCASIONS = {"Casual": "casual", "Formal": "formal", "Sports": "sports"}
CLASSES = ("summer", "winter", "casual", "formal", "sports")
OUTPUTS = ("hf_fashion", "hf_fashion_manifest.csv", "hf_fashion_audit.json")
FIELDS = ("image_name", "source_dataset", "source_id", "source_row_index", "source_season", "source_usage",
          "season", "occasion", "season_valid", "occasion_valid", "color", "color_valid", "category", "category_valid",
          "sleeve_length", "sleeve_length_valid", "pattern", "pattern_valid", "needs_manual_review", "image_sha256")


def labels_for(row):
    # Deliberately exact, not case-folded aliases or fuzzy matching.
    return {"season": SEASONS.get(row.get("season")), "occasion": OCCASIONS.get(row.get("usage"))}


def stable_id(row):
    value = row.get("id")
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str) and value.strip() and value.strip().lower() not in ("na", "nan", "none"):
        return value.strip()
    return None


def image_bytes(row):
    image = row.get("image")
    if not isinstance(image, dict) or not isinstance(image.get("bytes"), (bytes, bytearray)):
        raise ValueError("Expected embedded image bytes from Image(decode=False); no arbitrary path/URL downloads")
    return bytes(image["bytes"])


def validate_image(raw):
    with Image.open(BytesIO(raw)) as image:
        extension = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}.get(image.format)
        if extension is None:
            raise ValueError("Unsupported image format")
        image.verify()
    return extension


def check_outputs(root, overwrite):
    root = Path(root).resolve()
    paths = [root / name for name in OUTPUTS]
    for path in paths:
        if path.is_symlink() or path.resolve().parent != root:
            raise ValueError("Output paths must be direct non-symlink children of the output root")
    if not overwrite and any(path.exists() for path in paths):
        raise FileExistsError("Phase 3 outputs already exist; choose another --output-root or explicitly use --overwrite")
    return root


def collect(rows, output_root, *, target=200, seed=42, max_rows=5000, batch_size=32,
            max_stream_bytes=1024**3, overwrite=False, revision=None, progress=None):
    if target < 1 or max_rows < 1 or batch_size < 1 or max_stream_bytes < 1:
        raise ValueError("Targets and collection limits must be positive")
    root = check_outputs(output_root, overwrite)
    root.mkdir(parents=True, exist_ok=True)
    counts = Counter({label: 0 for label in CLASSES})
    observed = Counter({label: 0 for label in CLASSES})
    seen_ids, hashes = set(), set()
    selected, failures = [], []
    scanned = duplicates = received_bytes = saved_bytes = 0
    stop, error = "max_rows", None
    iterator = iter(rows)
    # The temporary directory is a verified direct child of this run's root.
    with tempfile.TemporaryDirectory(prefix=".hf_fashion_collect_", dir=root) as temporary:
        stage = Path(temporary).resolve()
        if stage.parent != root:
            raise ValueError("Unexpected staging directory")
        images = stage / OUTPUTS[0]
        images.mkdir()
        exhausted = False
        while scanned < max_rows and received_bytes < max_stream_bytes:
            if all(counts[label] >= target for label in CLASSES):
                stop = "targets_met"
                break
            batch = []
            for _ in range(min(batch_size, max_rows - scanned)):
                try:
                    row = next(iterator)
                except StopIteration:
                    exhausted = True
                    break
                except Exception as exc:
                    error = f"{type(exc).__name__}: {exc}"
                    break
                index = scanned
                scanned += 1
                mapped = labels_for(row)
                observed.update(value for value in mapped.values() if value)
                embedded = row.get("image")
                raw = embedded.get("bytes") if isinstance(embedded, dict) else None
                received_bytes += len(raw) if isinstance(raw, (bytes, bytearray)) else 0
                if any(value and counts[value] < target for value in mapped.values()):
                    key = hashlib.sha256(f"{seed}:{index}:{stable_id(row)}".encode()).hexdigest()
                    batch.append((key, index, row, mapped))
                if received_bytes >= max_stream_bytes:
                    break
            while batch:
                # Prefer rows contributing to two deficits, then seeded tie order.
                batch.sort(key=lambda item: (-sum(max(0, target - counts[v]) / target for v in item[3].values() if v), item[0]))
                _, index, row, mapped = batch.pop(0)
                if not any(v and counts[v] < target for v in mapped.values()):
                    continue
                identifier = stable_id(row)
                if identifier is not None and identifier in seen_ids:
                    duplicates += 1
                    continue
                try:
                    raw = image_bytes(row)
                    digest = hashlib.sha256(raw).hexdigest()
                    if digest in hashes:
                        duplicates += 1
                        if identifier is not None:
                            seen_ids.add(identifier)
                        continue
                    extension = validate_image(raw)
                except (ValueError, OSError, Image.DecompressionBombError) as exc:
                    failures.append({"source_row_index": index, "source_id": identifier, "error": str(exc)})
                    continue
                name = digest + extension
                (images / name).write_bytes(raw)
                hashes.add(digest)
                if identifier is not None:
                    seen_ids.add(identifier)
                counts.update(value for value in mapped.values() if value)
                saved_bytes += len(raw)
                item = {field: "" for field in FIELDS}
                item.update(image_name=f"hf_fashion/{name}", source_dataset=SOURCE,
                            source_id=identifier if identifier is not None else "sha256:" + digest,
                            source_row_index=index, source_season=row.get("season") or "", source_usage=row.get("usage") or "",
                            season=mapped["season"] or "", occasion=mapped["occasion"] or "",
                            season_valid=int(mapped["season"] is not None), occasion_valid=int(mapped["occasion"] is not None),
                            color_valid=0, category_valid=0, sleeve_length_valid=0, pattern_valid=0,
                            needs_manual_review=1, image_sha256=digest)
                selected.append(item)
            if progress:
                progress({"rows_scanned": scanned, "images_saved": len(selected), "counts": dict(counts)})
            if all(counts[label] >= target for label in CLASSES):
                stop = "targets_met"
                break
            if error:
                stop = "stream_error"
                break
            if exhausted:
                stop = "dataset_exhausted"
                break
            if received_bytes >= max_stream_bytes:
                stop = "stream_image_byte_limit"
                break
        selected.sort(key=lambda item: item["source_row_index"])
        audit = {"collector_version": 1, "source_dataset": SOURCE, "source_split": "train", "revision": revision,
                 "seed": seed, "selection": "bounded source-order batches; largest unmet deficit first; sha256(seed:row:id) ties",
                 "target_per_class": target, "max_rows": max_rows, "batch_size": batch_size,
                 "max_stream_image_bytes": max_stream_bytes, "rows_scanned": scanned, "stop_reason": stop,
                 "images_saved": len(selected), "counts": dict(counts), "observed_row_label_counts": dict(observed),
                 "shortages": {label: max(0, target - counts[label]) for label in CLASSES},
                 "shortage_scope": "saved unique images from inspected rows; not a claim about unseen rows",
                 "duplicates_skipped": duplicates, "invalid_images": failures, "stream_error": error,
                 "streamed_image_bytes": received_bytes, "saved_image_bytes": saved_bytes,
                 "valid_heads": {"season": counts["summer"] + counts["winter"],
                                 "occasion": counts["casual"] + counts["formal"] + counts["sports"],
                                 "color": 0, "category": 0, "sleeve_length": 0, "pattern": 0},
                 "notes": ["All selected rows need manual visual review; source includes non-clothing products",
                           "All mapped labels are retained, so incidental counts can exceed target",
                           "Byte limit measures yielded encoded images, not HTTP/parquet read-ahead",
                           "No eager dataset download, full snapshot, training, or checkpoint writes",
                           "Source row indices are zero-based in the pinned, unshuffled train stream"]}
        with (stage / OUTPUTS[1]).open("x", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(selected)
        (stage / OUTPUTS[2]).write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
        # Recheck before publishing; explicit overwrite backs up only these outputs.
        check_outputs(root, overwrite)
        if overwrite and any((root / name).exists() for name in OUTPUTS):
            backup = root / (".hf_fashion_backup_" + uuid.uuid4().hex)
            backup.mkdir()
            for name in OUTPUTS:
                if (root / name).exists():
                    (root / name).rename(backup / name)
            audit["previous_outputs_backup"] = str(backup)
            (stage / OUTPUTS[2]).write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
        for name in OUTPUTS:
            (stage / name).rename(root / name)
    return audit


def load_existing(root):
    """Validate the existing collection and snapshot its metadata before append."""
    root = check_outputs(root, True)
    if (root / ".hf_fashion_pending.json").exists():
        raise RuntimeError("An interrupted append journal exists; recover it before continuing")
    manifest_bytes = (root / OUTPUTS[1]).read_bytes()
    audit_bytes = (root / OUTPUTS[2]).read_bytes()
    audit = json.loads(audit_bytes)
    if audit.get("revision") != PINNED_REVISION or audit.get("source_dataset") != SOURCE:
        raise ValueError("Existing collection must use the pinned dataset revision")
    reader = csv.DictReader(StringIO(manifest_bytes.decode("utf-8-sig")))
    if tuple(reader.fieldnames or ()) != FIELDS:
        raise ValueError("Unexpected existing manifest columns")
    rows = list(reader)
    ids, hashes, paths = set(), set(), set()
    counts = Counter({label: 0 for label in CLASSES})
    for row in rows:
        identifier, digest = row["source_id"], row["image_sha256"]
        path = (root / row["image_name"]).resolve()
        if path.parent != root / OUTPUTS[0] or not path.is_file():
            raise ValueError("Manifest image must exist directly inside hf_fashion")
        if row["source_dataset"] != SOURCE or not identifier or identifier in ids or digest in hashes or path in paths:
            raise ValueError("Duplicate/invalid existing image identity")
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Existing image hash mismatch: {row['image_name']}")
        for head, mapping, field in (("season", SEASONS, "source_season"), ("occasion", OCCASIONS, "source_usage")):
            expected = mapping.get(row[field], "")
            if row[head] != expected or row[head + "_valid"] != str(int(bool(expected))):
                raise ValueError("Existing trusted-label mapping/mask mismatch")
            if expected:
                counts[expected] += 1
        for head in ("color", "category", "sleeve_length", "pattern"):
            if row[head] or row[head + "_valid"] != "0":
                raise ValueError("Unexpected trusted non-target head")
        ids.add(identifier)
        hashes.add(digest)
        paths.add(path)
    if set((root / OUTPUTS[0]).iterdir()) != paths:
        raise ValueError("Untracked image files exist; refusing unsafe continuation")
    if audit.get("images_saved") != len(rows) or audit.get("counts") != dict(counts):
        raise ValueError("Existing audit and manifest disagree")
    return root, rows, audit, manifest_bytes, audit_bytes, ids, hashes, counts


def formal_hf_rows(stats):
    """Push usage filtering into Parquet; metadata-only stream preserves row IDs."""
    from datasets import Image as HFImage, load_dataset
    metadata = enumerate(load_dataset(SOURCE, split="train", streaming=True,
                                      revision=PINNED_REVISION, columns=["id", "season", "usage"]))
    images = load_dataset(SOURCE, split="train", streaming=True, revision=PINNED_REVISION,
                          columns=["id", "season", "usage", "image"], filters=[("usage", "==", "Formal")])
    images = images.cast_column("image", HFImage(decode=False))
    for row in images:
        for index, meta in metadata:
            stats["metadata_rows_scanned"] = index + 1
            if meta["usage"] == "Formal":
                break
        else:
            raise ValueError("Filtered stream exceeded metadata stream")
        if any(row.get(key) != meta.get(key) for key in ("id", "season", "usage")):
            raise ValueError("Filtered stream order differs from source metadata; refusing incorrect row index")
        yield {**row, "_source_row_index": index}
    for index, meta in metadata:
        stats["metadata_rows_scanned"] = index + 1
        if meta["usage"] == "Formal":
            raise ValueError("Filtered stream omitted a formal row")


def continue_formal(rows, output_root, *, new_target=166, stream_stats=None, progress=None):
    """Append formal-only rows, with no scan cap and no changes to old images."""
    if new_target < 1:
        raise ValueError("new_target must be positive")
    root = Path(output_root).resolve()
    lock = root / ".hf_fashion_continue.lock"
    with lock.open("x", encoding="utf-8") as stream:
        stream.write(str(os.getpid()))
    try:
        root, existing, audit, before_csv, before_audit, ids, hashes, counts = load_existing(root)
        initial_formal = counts["formal"]
        selected, failures = [], []
        scanned = duplicates = ignored = received = saved = 0
        stop = "dataset_exhausted"
        with tempfile.TemporaryDirectory(prefix=".hf_formal_", dir=root) as temporary:
            stage = Path(temporary).resolve()
            if stage.parent != root:
                raise ValueError("Unexpected staging path")
            for ordinal, row in enumerate(rows):
                scanned += 1
                if row.get("usage") != "Formal":
                    ignored += 1
                    continue
                raw_value = row.get("image")
                raw_value = raw_value.get("bytes") if isinstance(raw_value, dict) else None
                received += len(raw_value) if isinstance(raw_value, (bytes, bytearray)) else 0
                identifier = stable_id(row)
                if identifier in ids:
                    duplicates += 1
                    continue
                try:
                    raw = image_bytes(row)
                    digest = hashlib.sha256(raw).hexdigest()
                    if digest in hashes:
                        duplicates += 1
                        if identifier:
                            ids.add(identifier)
                        continue
                    extension = validate_image(raw)
                except (ValueError, OSError, Image.DecompressionBombError) as exc:
                    failures.append({"source_id": identifier, "error": str(exc)})
                    continue
                index = row.get("_source_row_index", ordinal)
                season = SEASONS.get(row.get("season"), "")
                name = digest + extension
                with (stage / name).open("xb") as stream:
                    stream.write(raw)
                item = {field: "" for field in FIELDS}
                item.update(image_name="hf_fashion/" + name, source_dataset=SOURCE,
                            source_id=identifier or "sha256:" + digest, source_row_index=index,
                            source_season=row.get("season") or "", source_usage="Formal",
                            season=season, season_valid=int(bool(season)), occasion="formal", occasion_valid=1,
                            color_valid=0, category_valid=0, sleeve_length_valid=0, pattern_valid=0,
                            needs_manual_review=1, image_sha256=digest)
                selected.append(item)
                ids.add(item["source_id"])
                hashes.add(digest)
                counts["formal"] += 1
                if season:
                    counts[season] += 1
                saved += len(raw)
                if progress and len(selected) % 20 == 0:
                    progress({"new_formal": len(selected), "formal_total": counts["formal"], "formal_rows_scanned": scanned,
                              "metadata_rows_scanned": (stream_stats or {}).get("metadata_rows_scanned", 0)})
                if len(selected) >= new_target:
                    stop = "new_formal_target_met"
                    break
            run = {"mode": "formal_only_continuation", "revision": PINNED_REVISION,
                   "initial_formal": initial_formal, "new_target": new_target, "new_formal_images": len(selected),
                   "final_formal": counts["formal"], "rows_scanned": scanned,
                   "metadata_rows_scanned": (stream_stats or {}).get("metadata_rows_scanned", 0),
                   "ignored_nonformal_rows": ignored, "duplicates_skipped": duplicates,
                   "streamed_image_bytes": received, "saved_image_bytes": saved,
                   "invalid_images": failures, "stop_reason": stop,
                   "shortage_new_formal": max(0, new_target - len(selected))}
            # No metadata mutation when nothing new can be appended.
            if not selected:
                return {**run, "final_images": len(existing)}
            if (root / OUTPUTS[1]).read_bytes() != before_csv or (root / OUTPUTS[2]).read_bytes() != before_audit:
                raise RuntimeError("Existing metadata changed during collection; refusing append")
            addition = StringIO(newline="")
            csv.DictWriter(addition, fieldnames=FIELDS).writerows(selected)
            combined = before_csv + (b"" if before_csv.endswith(b"\n") else b"\r\n") + addition.getvalue().encode("utf-8")
            updated = dict(audit)
            if "initial_collection" not in updated:
                updated["initial_collection"] = dict(audit)
            updated["continuations"] = [*audit.get("continuations", []), run]
            updated.update(counts=dict(counts), images_saved=len(existing) + len(selected),
                           shortages={label: max(0, audit["target_per_class"] - counts[label]) for label in CLASSES},
                           saved_image_bytes=audit["saved_image_bytes"] + saved,
                           streamed_image_bytes=audit["streamed_image_bytes"] + received,
                           rows_scanned=audit["rows_scanned"] + scanned,
                           duplicates_skipped=audit["duplicates_skipped"] + duplicates,
                           invalid_images=[*audit.get("invalid_images", []), *failures],
                           stop_reason=stop, stream_error=None,
                           valid_heads={"season": counts["summer"] + counts["winter"],
                                        "occasion": counts["casual"] + counts["formal"] + counts["sports"],
                                        "color": 0, "category": 0, "sleeve_length": 0, "pattern": 0})
            updated["notes"] = [*audit.get("notes", []), "Continuation rows_scanned count filtered image rows; metadata scan is separate; byte counts exclude HTTP read-ahead"]
            backup = root / (".hf_fashion_append_backup_" + uuid.uuid4().hex)
            backup.mkdir()
            (backup / OUTPUTS[1]).write_bytes(before_csv)
            (backup / OUTPUTS[2]).write_bytes(before_audit)
            run["metadata_backup"] = str(backup)
            (stage / OUTPUTS[1]).write_bytes(combined)
            (stage / OUTPUTS[2]).write_text(json.dumps(updated, indent=2) + "\n", encoding="utf-8")
            journal = root / ".hf_fashion_pending.json"
            journal.write_text(json.dumps({"backup": str(backup), "new_images": [r["image_name"] for r in selected]}), encoding="utf-8")
            created = []
            manifest_replaced = audit_replaced = False
            try:
                for item in selected:
                    destination = root / item["image_name"]
                    # Exclusive creation can never replace an existing image.
                    with destination.open("xb") as stream:
                        created.append(destination)
                        stream.write((stage / destination.name).read_bytes())
                os.replace(stage / OUTPUTS[1], root / OUTPUTS[1])
                manifest_replaced = True
                os.replace(stage / OUTPUTS[2], root / OUTPUTS[2])
                audit_replaced = True
            except BaseException:
                if manifest_replaced:
                    (stage / "rollback.csv").write_bytes(before_csv)
                    os.replace(stage / "rollback.csv", root / OUTPUTS[1])
                if audit_replaced:
                    (stage / "rollback.json").write_bytes(before_audit)
                    os.replace(stage / "rollback.json", root / OUTPUTS[2])
                for path in created:
                    if path.resolve().parent != root / OUTPUTS[0]:
                        raise RuntimeError("Unexpected rollback path")
                    path.unlink()
                journal.unlink()
                raise
            journal.unlink()
            return {**run, "final_images": updated["images_saved"]}
    finally:
        lock.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", default="../datasets/phase3_rewearx")
    parser.add_argument("--target-per-class", type=int, default=200)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-rows", type=int, default=5000)
    parser.add_argument("--max-stream-mib", type=int, default=1024)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--revision", help="Dataset commit; default resolves current commit and records it")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--continue-formal", action="store_true", help="Append only new Formal rows, with no scan/byte cap")
    parser.add_argument("--new-formal", type=int, default=166)
    args = parser.parse_args(argv)
    if args.continue_formal:
        if args.overwrite or (args.revision and args.revision != PINNED_REVISION):
            parser.error("Formal continuation forbids overwrite and requires the pinned revision")
        stats = {}
        result = continue_formal(formal_hf_rows(stats), args.output_root, new_target=args.new_formal,
                                 stream_stats=stats, progress=lambda info: print(json.dumps(info), flush=True))
        print(json.dumps(result, indent=2))
        return 0
    check_outputs(args.output_root, args.overwrite)  # Before any network access.
    if min(args.target_per_class, args.max_rows, args.max_stream_mib, args.batch_size) < 1:
        parser.error("Targets and bounds must be positive")
    from datasets import Image as HFImage, load_dataset
    from huggingface_hub import HfApi
    revision = args.revision or HfApi().dataset_info(SOURCE).sha
    dataset = load_dataset(SOURCE, split="train", streaming=True, revision=revision,
                           columns=["id", "season", "usage", "image"])
    dataset = dataset.cast_column("image", HFImage(decode=False))
    audit = collect(dataset, args.output_root, target=args.target_per_class, seed=args.seed,
                    max_rows=args.max_rows, batch_size=args.batch_size,
                    max_stream_bytes=args.max_stream_mib * 1024**2, overwrite=args.overwrite, revision=revision,
                    progress=lambda info: print(json.dumps(info), flush=True))
    print(json.dumps(audit, indent=2))
    return 1 if audit["stream_error"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
