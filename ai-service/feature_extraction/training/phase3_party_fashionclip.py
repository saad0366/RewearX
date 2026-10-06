"""Strict local-only FashionCLIP party pseudo-label collection; never trains."""

import argparse
from collections import Counter
import csv
import hashlib
from io import BytesIO
import itertools
import json
import math
import os
from pathlib import Path
import re
import statistics
import tempfile
import time

from PIL import Image

MODEL = "patrickjohncyh/fashion-clip"
REVISION = "7e3ba62ce16b379a1ab479346b66f192e76f51b7"
PARTY = ("party outfit", "celebration outfit", "cocktail party outfit", "festive party wear")
COMPETITORS = {"wedding": "wedding outfit", "formal": "formal office outfit",
               "casual": "casual everyday outfit", "sports": "sportswear outfit"}
PROMPTS = PARTY + tuple(COMPETITORS.values())
OTHER_HEADS = ("color", "season", "category", "sleeve_length", "pattern")
OUTPUTS = ("party_fashionclip", "party_fashionclip_manifest.csv", "party_fashionclip_audit.json")
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
FIELDS = ("image_name", "source_dataset", "source_path", "source_id", "source_group",
          "image_sha256", "party_group_score", "second_best_occasion", "second_best_score", "score_margin",
          "party_prompt_1_score", "party_prompt_2_score", "party_prompt_3_score", "party_prompt_4_score",
          "wedding_score", "party_prompt_agreement", "occasion", "occasion_valid", "color", "color_valid",
          "season", "season_valid", "category", "category_valid", "sleeve_length", "sleeve_length_valid",
          "pattern", "pattern_valid", "pseudo_label", "pseudo_label_model", "needs_manual_review")


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def score_metrics(scores):
    """Input is eight unscaled cosine similarities in PROMPTS order."""
    if len(scores) != 8 or any(not math.isfinite(x) or not -1.000001 <= x <= 1.000001 for x in scores):
        raise ValueError("Expected eight finite cosine similarities")
    party = statistics.mean(scores[:4])
    rivals = dict(zip(COMPETITORS, scores[4:]))
    second = max(rivals, key=rivals.get)
    top = party > rivals[second]  # Ties are ambiguous.
    margin = party - rivals[second]
    agreement = sum(x > rivals[second] for x in scores[:4])
    return {"party_top": top, "party_group_score": party, "second_best_occasion": second,
            "second_best_score": rivals[second], "score_margin": margin,
            "party_prompt_agreement": agreement,
            **{name + "_score": value for name, value in rivals.items()},
            **{f"party_prompt_{i + 1}_score": v for i, v in enumerate(scores[:4])}}


def decision(scores):
    metrics = score_metrics(scores)
    top, margin, agreement = (metrics[k] for k in ("party_top", "score_margin", "party_prompt_agreement"))
    wedding_near = metrics["party_group_score"] - metrics["wedding_score"] <= 0.03 + 1e-12
    reasons = []
    if not top:
        reasons.append("not_party_top")
    if margin + 1e-12 < 0.08:
        reasons.append("insufficient_margin")
    if agreement < 3:
        reasons.append("insufficient_agreement")
    if wedding_near:
        reasons.append("wedding_too_close")
    return {"accepted": not reasons, "reasons": reasons, **metrics}


def walk_files(root):
    root = Path(root).resolve()
    pending = [root]
    while pending:
        # DirEntry caches the Windows enumeration metadata. Re-stat'ing hundreds
        # of thousands of paths would make even a small dry-run unnecessarily slow.
        with os.scandir(pending.pop()) as stream:
            entries = sorted(stream, key=lambda entry: entry.name)
        for entry in entries:
            linked = entry.is_symlink() or bool(getattr(entry.stat(follow_symlinks=False),
                                                       "st_file_attributes", 0) & 0x400)
            if entry.is_dir(follow_symlinks=False):
                if not linked:
                    pending.append(Path(entry.path))
            elif linked:
                raise ValueError(f"Unsafe file link: {entry.path}")
            elif entry.is_file(follow_symlinks=False):
                yield Path(entry.path)


def protected_inventory(phase3, checkpoints):
    files = list(walk_files(phase3)) if Path(phase3).exists() else []
    files += [Path(p).resolve() for p in checkpoints]
    return {str(p): sha256(p) for p in files if not p.name.startswith(".party_fashionclip.lock")}


def existing_exclusions(phase3, inventory):
    """Read every CSV plus actual local images; fail closed on unreadable files."""
    hashes, ids, paths, groups = set(), set(), set(), set()
    root = Path(phase3).resolve()
    for name, digest in inventory.items():
        path = Path(name)
        if not path.is_relative_to(root):
            continue
        if path.suffix.lower() in EXTENSIONS:
            hashes.add(digest)
        if path.suffix.lower() != ".csv":
            continue
        with path.open(encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                for key in ("image_sha256", "sha256", "image_hash"):
                    value = (row.get(key) or "").strip().lower()
                    if re.fullmatch(r"[0-9a-f]{64}", value):
                        hashes.add(value)
                dataset, source_id = row.get("source_dataset"), row.get("source_id")
                if dataset and source_id:
                    ids.add((dataset.casefold(), source_id.replace("\\", "/")))
                if dataset and row.get("source_group"):
                    groups.add((dataset.casefold(), row["source_group"]))
                for key in ("source_path", "source_local_path"):
                    if row.get(key):
                        value = Path(row[key])
                        if value.is_absolute():
                            paths.add(str(value.resolve()).casefold())
    return hashes, ids, paths, groups


def candidates(sources, phase3, seed):
    """Stable hash ordering within sources, then round-robin source diversity."""
    phase3 = Path(phase3).resolve()
    pools = []
    for dataset, source in sorted(sources.items()):
        root = Path(source).resolve()
        if not root.is_dir() or root.is_relative_to(phase3) or phase3.is_relative_to(root):
            raise ValueError(f"Source must exist and be separate from Phase 3: {root}")
        pool = []
        for path in walk_files(root):
            if path.suffix.lower() not in EXTENSIONS:
                continue
            relative = path.relative_to(root)
            # DeepFashion's named item directory groups its views conservatively.
            # Other pools use only an explicit trailing -N or _viewN suffix.
            group = (relative.parent.as_posix() if dataset == "deepfashion_attribute" and relative.parent != Path(".")
                     else re.sub(r"(?:-\d+|_view\d+)$", "", relative.with_suffix("").as_posix()))
            pool.append({"source_dataset": dataset, "source_id": relative.as_posix(),
                         "source_group": group, "source_path": str(path)})
        pool.sort(key=lambda r: hashlib.sha256(f"{seed}:{dataset}:{r['source_id']}".encode()).digest())
        pools.append(pool)
    return [item for batch in itertools.zip_longest(*pools) for item in batch if item is not None]


class FashionClip:
    def __init__(self, model_dir=None, device="cpu", threads=4):
        import torch
        import transformers
        from transformers import AutoProcessor, AutoModelForZeroShotImageClassification
        torch.manual_seed(42)
        torch.set_num_threads(threads)
        torch.use_deterministic_algorithms(True)
        location = str(model_dir) if model_dir else MODEL
        kwargs = {"local_files_only": True} if model_dir else {"revision": REVISION}
        self.processor = AutoProcessor.from_pretrained(location, **kwargs)
        self.model = AutoModelForZeroShotImageClassification.from_pretrained(
            location, use_safetensors=True, **kwargs).to(device).eval()
        self.device = device
        text = self.processor(text=list(PROMPTS), return_tensors="pt", padding=True)
        with torch.inference_mode():
            features = self.model.get_text_features(**{k: v.to(device) for k, v in text.items()})
            if not isinstance(features, torch.Tensor):
                features = features.pooler_output
            self.text = torch.nn.functional.normalize(features.float(), dim=-1)
        self.metadata = {"model": MODEL, "model_revision": REVISION, "device": device,
                         "torch_version": torch.__version__, "transformers_version": transformers.__version__,
                         "processor_class": type(self.processor).__name__,
                         "processor_config": self.processor.image_processor.to_dict(),
                         "model_config": self.model.config.to_dict(), "threads": threads,
                         "similarity": "dot(L2(image_projection), L2(text_projection)); float32; no logit_scale, softmax or sigmoid",
                         "prompts": list(PROMPTS), "party_group": "arithmetic mean of first four cosine scores"}
        if model_dir:
            self.metadata["model_files_sha256"] = {p.name: sha256(p) for p in Path(model_dir).iterdir()
                                                   if p.is_file() and p.suffix in (".json", ".txt", ".safetensors")}

    def __call__(self, images):
        import torch
        inputs = self.processor(images=images, return_tensors="pt")
        with torch.inference_mode():
            features = self.model.get_image_features(**{k: v.to(self.device) for k, v in inputs.items()})
            if not isinstance(features, torch.Tensor):
                features = features.pooler_output
            image = torch.nn.functional.normalize(features.float(), dim=-1)
            return (image @ self.text.T).cpu().tolist()


def summary(values):
    return {"min": min(values), "mean": statistics.mean(values), "median": statistics.median(values),
            "max": max(values)} if values else {k: None for k in ("min", "mean", "median", "max")}


def manifest_row(source, result, digest, extension):
    row = {k: "" for k in FIELDS}
    row.update(source)
    row.update({k: v for k, v in result.items() if k in FIELDS})
    row.update(image_name=f"{OUTPUTS[0]}/{digest}{extension}", image_sha256=digest,
               occasion="party", occasion_valid=1, pseudo_label=1, pseudo_label_model=MODEL, needs_manual_review=1)
    row.update({h + "_valid": 0 for h in OTHER_HEADS})
    return row


def ensure_new(root):
    for name in OUTPUTS:
        if (Path(root) / name).exists() or (Path(root) / name).is_symlink():
            raise FileExistsError(f"Refusing to overwrite: {Path(root) / name}")


def collect(sources, phase3, predictor, *, target=500, max_images=10000, seed=42, batch_size=8,
            checkpoints=(), dry_run=None, progress=None):
    if min(target, max_images, batch_size) <= 0:
        raise ValueError("target, max_images and batch_size must be positive")
    root = Path(phase3).resolve()
    if dry_run:
        dry_run = Path(dry_run).resolve()
        if dry_run.exists() or dry_run.is_relative_to(root):
            raise FileExistsError("Dry-run report must be a new file outside Phase 3")
    else:
        ensure_new(root)
    before = protected_inventory(root, checkpoints)
    hashes, ids, paths, groups = existing_exclusions(root, before)
    existing_hash_count = len(hashes)
    pool = candidates(sources, root, seed)
    counts = Counter({key: 0 for key in ("total_images_examined", "inference_failures", "image_read_failures",
                     "party_top_ranked", "strict_accepted_before_group_dedup", "rejected_not_party_top",
                     "rejected_insufficient_margin", "rejected_insufficient_agreement", "rejected_wedding_too_close",
                     "duplicate_images_skipped", "duplicate_source_ids_skipped", "duplicate_groups_skipped")})
    chosen, samples, errors, examined_sources = [], [], [], Counter()
    root.mkdir(parents=True, exist_ok=True)
    lock = root / ".party_fashionclip.lock"
    with lock.open("x") as stream:
        stream.write("dry-run" if dry_run else "collection")
    try:
        with tempfile.TemporaryDirectory(prefix="party_fashionclip_", dir=root.parent) as temp:
            stage = Path(temp)
            (stage / OUTPUTS[0]).mkdir()
            index = 0
            while index < len(pool) and counts["total_images_examined"] < max_images and len(chosen) < target:
                pending, images = [], []
                while index < len(pool) and len(pending) < batch_size and counts["total_images_examined"] < max_images:
                    source = pool[index]
                    index += 1
                    key = (source["source_dataset"].casefold(), source["source_id"])
                    group = (key[0], source["source_group"])
                    if key in ids or source["source_path"].casefold() in paths:
                        counts["duplicate_source_ids_skipped"] += 1
                        continue
                    if group in groups:
                        counts["duplicate_groups_skipped"] += 1
                        continue
                    try:
                        source_path = Path(source["source_path"]).resolve()
                        if (not source_path.is_relative_to(Path(sources[source["source_dataset"]]).resolve())
                                or source_path.is_relative_to(root)):
                            raise ValueError("Candidate escaped its allowed source root")
                        raw = source_path.read_bytes()
                        digest = hashlib.sha256(raw).hexdigest()
                        if digest in hashes:
                            counts["duplicate_images_skipped"] += 1
                            continue
                        hashes.add(digest)
                        ids.add(key)
                        counts["total_images_examined"] += 1
                        examined_sources[source["source_dataset"]] += 1
                        with Image.open(BytesIO(raw)) as im:
                            im.load()
                            images.append(im.copy())
                        pending.append((source, digest, group))
                    except (OSError, ValueError, Image.DecompressionBombError) as exc:
                        counts["image_read_failures"] += 1
                        errors.append({"source_path": source["source_path"], "error": str(exc)})
                if not pending:
                    continue
                try:
                    scores = predictor(images)
                    if len(scores) != len(pending):
                        raise ValueError("Predictor batch size mismatch")
                except Exception as exc:
                    scores = [None] * len(pending)
                    errors.append({"batch_error": str(exc)})
                finally:
                    for im in images:
                        im.close()
                for (source, digest, group), values in zip(pending, scores):
                    try:
                        if values is None:
                            raise ValueError("Inference failed")
                        result = decision(values)
                    except (TypeError, ValueError) as exc:
                        counts["inference_failures"] += 1
                        errors.append({"source_path": source["source_path"], "error": str(exc)})
                        continue
                    counts["party_top_ranked"] += result["party_top"]
                    for reason in result["reasons"]:
                        counts["rejected_" + reason] += 1
                    if len(samples) < 50:
                        samples.append({**source, "scores": values, **result})
                    if result["accepted"]:
                        counts["strict_accepted_before_group_dedup"] += 1
                        if group in groups:
                            counts["duplicate_groups_skipped"] += 1
                            continue
                        if len(chosen) >= target:
                            continue
                        groups.add(group)
                        row = manifest_row(source, result, digest, Path(source["source_path"]).suffix.lower())
                        chosen.append(row)
                        if not dry_run:
                            raw = Path(source["source_path"]).read_bytes()
                            if hashlib.sha256(raw).hexdigest() != digest:
                                raise RuntimeError("Source image changed during inference")
                            (stage / row["image_name"]).write_bytes(raw)
                if progress:
                    progress({"examined": counts["total_images_examined"], "accepted": len(chosen),
                              "party_top": counts["party_top_ranked"]})
            # Verify every pre-existing image, manifest and checkpoint before publishing.
            changed = [name for name, digest in before.items() if not Path(name).is_file() or sha256(name) != digest]
            if changed:
                raise RuntimeError(f"Protected files changed: {changed}")
            report = {"status": "dry_run" if dry_run else "complete", **counts,
                      "target": target, "max_images": max_images, "seed": seed,
                      "available_source_images": len(pool), "source_rows_visited": index,
                      "source_pool_exhausted": index == len(pool), "final_unique_party_count": len(chosen),
                      "images_saved": 0 if dry_run else len(chosen), "shortage": max(0, target - len(chosen)),
                      "stop_reason": "target_reached" if len(chosen) >= target else
                                     "source_pool_exhausted" if index == len(pool) else "max_images",
                      "source_dataset_distribution": dict(Counter(r["source_dataset"] for r in chosen)),
                      "examined_source_distribution": dict(examined_sources),
                      "party_score_statistics": summary([r["party_group_score"] for r in chosen]),
                      "margin_statistics": summary([r["score_margin"] for r in chosen]),
                      "existing_phase3_unique_hashes": existing_hash_count,
                      "protected_files_verified_unchanged": len(before),
                      "checkpoint_sha256": {str(Path(p).resolve()): before[str(Path(p).resolve())] for p in checkpoints},
                      "model_details": predictor.metadata, "sample_scores": samples, "errors": errors,
                      "criteria": {"minimum_cosine_margin": 0.08, "minimum_prompt_agreement": 3,
                                   "wedding_exclusion_margin": 0.03, "strict_party_top": True},
                      "notes": ["Scores are cosine similarities, not calibrated probabilities",
                                "Rejection counts overlap; each failed rule is counted independently",
                                "Bounded run: shortage does not imply exhaustion unless source_pool_exhausted is true",
                                "All accepted pseudo-labels require manual review",
                                "Named DeepFashion folders are conservative product groups; other sources use explicit view suffixes"]}
            if dry_run:
                dry_run.parent.mkdir(parents=True, exist_ok=True)
                with dry_run.open("x", encoding="utf-8") as stream:
                    json.dump(report, stream, indent=2)
            else:
                with (stage / OUTPUTS[1]).open("x", newline="", encoding="utf-8") as stream:
                    writer = csv.DictWriter(stream, fieldnames=FIELDS)
                    writer.writeheader()
                    writer.writerows(chosen)
                (stage / OUTPUTS[2]).write_text(json.dumps(report, indent=2), encoding="utf-8")
                ensure_new(root)
                published = []
                try:
                    for name in OUTPUTS:
                        (stage / name).rename(root / name)
                        published.append(name)
                except BaseException:
                    for name in reversed(published):
                        (root / name).rename(stage / name)
                    raise
            return report
    finally:
        lock.unlink()


SCORE_FIELDS = ("source_dataset", "source_path", "source_id", "source_group", "image_sha256",
                "party_group_score", "wedding_score", "formal_score", "casual_score", "sports_score",
                "second_best_occasion", "second_best_score", "party_margin", "party_minus_wedding",
                "party_prompt_agreement", "party_top1", "party_prompt_1_score", "party_prompt_2_score",
                "party_prompt_3_score", "party_prompt_4_score")
CALIBRATION_RULES = {"A": (0.010, 3, 0.005), "B": (0.015, 3, 0.0075),
                     "C": (0.010, 2, 0.0075), "D": (0.015, 2, 0.010)}


def distribution(values):
    ordered = sorted(values)
    def percentile(q):
        if not ordered:
            return None
        position = (len(ordered) - 1) * q / 100
        low = int(position)
        return ordered[low] + (ordered[min(low + 1, len(ordered) - 1)] - ordered[low]) * (position - low)
    return {"count": len(values), **summary(values),
            **{f"p{q}": percentile(q) for q in (50, 75, 90, 95, 99)}}


def calibration_statistics(rows):
    top = [row for row in rows if int(row["party_top1"]) == 1]
    def describe(subset):
        return {"party_group_score": distribution([float(r["party_group_score"]) for r in subset]),
                "party_margin": distribution([float(r["party_margin"]) for r in subset]),
                "party_minus_wedding": distribution([float(r["party_minus_wedding"]) for r in subset]),
                "agreement_counts": {f"{n}/4": sum(int(r["party_prompt_agreement"]) == n for r in subset)
                                     for n in range(5)}}
    rules = {}
    for name, (margin, agreement, wedding) in CALIBRATION_RULES.items():
        matched = sum(float(r["party_margin"]) >= margin and int(r["party_prompt_agreement"]) >= agreement
                      and float(r["party_minus_wedding"]) >= wedding for r in top)
        rules[name] = {"minimum_margin": margin, "minimum_agreement": agreement, "minimum_wedding_gap": wedding,
                       "accepted_count": matched, "percentage_of_all": 100 * matched / len(rows) if rows else 0,
                       "projected_per_10000": 10000 * matched / len(rows) if rows else 0}
    return {"scored_count": len(rows), "party_top1_count": len(top),
            "party_top1_percentage": 100 * len(top) / len(rows) if rows else 0,
            "all_scored": describe(rows), "party_top1_only": describe(top), "candidate_rules": rules}


def write_audit(path, report):
    temporary = path.with_suffix(".json.tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def calibrate(sources, phase3, predictor, output, *, count=3000, seed=42, batch_size=8,
              checkpoints=(), progress=None, started_at=None):
    """Score-only: persist every successful inference, never filter or copy images."""
    started = started_at if started_at is not None else time.perf_counter()
    if min(count, batch_size) <= 0:
        raise ValueError("Calibration count and batch size must be positive")
    root, output = Path(phase3).resolve(), Path(output).resolve()
    for protected in (root, *(Path(p).resolve() for p in sources.values())):
        if output.is_relative_to(protected) or protected.is_relative_to(output):
            raise ValueError("Calibration artifacts must be separate from all dataset directories")
    output.mkdir(parents=True, exist_ok=False)
    rows, errors = [], []
    counters = Counter({k: 0 for k in ("inference_failures", "image_read_failures", "duplicate_images_skipped",
                                     "duplicate_source_ids_skipped", "existing_groups_skipped",
                                     "inference_attempted_images", "source_rows_visited")})
    report = {"mode": "score_only_calibration", "status": "initializing", "requested_count": count,
              "seed": seed, "batch_size": batch_size, "model_details": predictor.metadata,
              "images_copied": 0, "acceptance_filter_applied": False, "selected_rule": None,
              "notes": ["Statistics are reported for all scored images and PARTY-top1 images separately",
                        "Rules are post-hoc comparisons only; they never determine which images are scored",
                        "Per-10000 counts are simple sample-rate projections, not guaranteed yields",
                        "Scores are flushed and fsynced after each completed batch",
                        "Successful rows survive interruption; audit may lag by at most the current batch",
                        "Calibration keeps the original candidate order; no new group-based acceptance filtering"]}
    inference_seconds = 0.0
    def save_status(status):
        report.update(status=status, **counters, runtime_seconds=time.perf_counter() - started,
                      inference_seconds=inference_seconds, statistics=calibration_statistics(rows), errors=errors,
                      source_distribution=dict(Counter(r["source_dataset"] for r in rows)))
        write_audit(output / "audit.json", report)
    save_status("initializing")
    try:
        before = protected_inventory(root, checkpoints)
        report["checkpoint_sha256_before"] = {str(Path(p).resolve()): before[str(Path(p).resolve())] for p in checkpoints}
        hashes, ids, paths, groups = existing_exclusions(root, before)
        report["existing_phase3_unique_hashes"] = len(hashes)
        pool = candidates(sources, root, seed)
        report["available_source_images"] = len(pool)
        source_roots = {name: Path(p).resolve() for name, p in sources.items()}
        with (output / "scores.csv").open("x", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=SCORE_FIELDS)
            writer.writeheader()
            stream.flush()
            os.fsync(stream.fileno())
            index = 0
            while index < len(pool) and len(rows) < count:
                pending, images = [], []
                while index < len(pool) and len(pending) < min(batch_size, count - len(rows)):
                    source = pool[index]
                    index += 1
                    counters["source_rows_visited"] = index
                    key = (source["source_dataset"].casefold(), source["source_id"])
                    if key in ids or source["source_path"].casefold() in paths:
                        counters["duplicate_source_ids_skipped"] += 1
                        continue
                    if (key[0], source["source_group"]) in groups:
                        counters["existing_groups_skipped"] += 1
                        continue
                    try:
                        path = Path(source["source_path"]).resolve()
                        if not path.is_relative_to(source_roots[source["source_dataset"]]) or path.is_relative_to(root):
                            raise ValueError("Candidate escaped its allowed source root")
                        raw = path.read_bytes()
                        digest = hashlib.sha256(raw).hexdigest()
                        if digest in hashes:
                            counters["duplicate_images_skipped"] += 1
                            continue
                        hashes.add(digest)
                        ids.add(key)
                        with Image.open(BytesIO(raw)) as image:
                            image.load()
                            images.append(image.copy())
                        pending.append((source, digest))
                    except (OSError, ValueError, Image.DecompressionBombError) as exc:
                        counters["image_read_failures"] += 1
                        errors.append({"source_path": source["source_path"], "error": str(exc)})
                if not pending:
                    continue
                counters["inference_attempted_images"] += len(pending)
                inference_start = time.perf_counter()
                try:
                    values = predictor(images)
                    if len(values) != len(pending):
                        raise ValueError("Predictor batch size mismatch")
                except Exception as exc:
                    values = [None] * len(pending)
                    errors.append({"batch_error": str(exc)})
                finally:
                    inference_seconds += time.perf_counter() - inference_start
                    for image in images:
                        image.close()
                for (source, digest), scores in zip(pending, values):
                    try:
                        metrics = score_metrics(scores)
                    except (TypeError, ValueError) as exc:
                        counters["inference_failures"] += 1
                        errors.append({"source_path": source["source_path"], "error": str(exc)})
                        continue
                    row = {**source, "image_sha256": digest,
                           **{k: v for k, v in metrics.items() if k in SCORE_FIELDS},
                           "party_margin": metrics["score_margin"],
                           "party_minus_wedding": metrics["party_group_score"] - metrics["wedding_score"],
                           "party_top1": int(metrics["party_top"])}
                    writer.writerow(row)
                    rows.append(row)
                stream.flush()
                os.fsync(stream.fileno())
                save_status("running")
                if progress:
                    progress({"scored": len(rows), "party_top1": report["statistics"]["party_top1_count"],
                              "inference_failures": counters["inference_failures"]})
        changed = [name for name, digest in before.items() if not Path(name).is_file() or sha256(name) != digest]
        if changed:
            raise RuntimeError(f"Protected files changed: {changed}")
        report.update(protected_files_verified_unchanged=len(before), checkpoints_unchanged=True,
                      checkpoint_sha256_after={str(Path(p).resolve()): sha256(p) for p in checkpoints},
                      scores_sha256=sha256(output / "scores.csv"), source_pool_exhausted=index == len(pool),
                      shortage=max(0, count - len(rows)))
        save_status("complete" if len(rows) == count else "source_exhausted")
        return report
    except BaseException as exc:
        report["stop_error"] = f"{type(exc).__name__}: {exc}"
        save_status("interrupted" if isinstance(exc, KeyboardInterrupt) else "failed")
        raise


def main(argv=None):
    started = time.perf_counter()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase3-root", default="../datasets/phase3_rewearx")
    parser.add_argument("--deepfashion-root", default="../datasets/deepfashion_attribute/img")
    parser.add_argument("--pakistani-root", default="../datasets/pakistani_fashion/train")
    parser.add_argument("--model-dir")
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--target", type=int, default=500)
    parser.add_argument("--max-images", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--dry-run-report", help="New JSON path outside Phase 3; no images or manifest are saved")
    parser.add_argument("--score-only", action="store_true", help="Persist calibration scores only; never select or copy images")
    parser.add_argument("--calibration-count", type=int, default=3000)
    parser.add_argument("--calibration-output", default="../artifacts/party_fashionclip_calibration")
    args = parser.parse_args(argv)
    if args.score_only and args.dry_run_report:
        parser.error("--score-only and --dry-run-report are separate modes")
    if args.score_only and Path(args.calibration_output).exists():
        raise FileExistsError(f"Refusing to overwrite calibration: {args.calibration_output}")
    if not args.dry_run_report and not args.score_only:
        ensure_new(args.phase3_root)
    predictor = FashionClip(args.model_dir, args.device, args.threads)
    print(json.dumps({"model_loaded": MODEL, "revision": REVISION, "device": args.device}), flush=True)
    if args.score_only:
        report = calibrate({"deepfashion_attribute": args.deepfashion_root, "pakistani_fashion": args.pakistani_root},
                           args.phase3_root, predictor, args.calibration_output, count=args.calibration_count,
                           seed=args.seed, batch_size=args.batch_size, started_at=started,
                           checkpoints=[Path(__file__).resolve().parents[1] / name for name in
                                        ("phase1_deepfashion_best.pt", "phase2_pakistani_best.pt")],
                           progress=lambda info: print(json.dumps(info), flush=True))
        print(json.dumps({k: v for k, v in report.items() if k not in ("model_details", "errors")}, indent=2))
        return
    report = collect({"deepfashion_attribute": args.deepfashion_root, "pakistani_fashion": args.pakistani_root},
                     args.phase3_root, predictor, target=args.target, max_images=args.max_images, seed=args.seed,
                     batch_size=args.batch_size, dry_run=args.dry_run_report,
                     checkpoints=[Path(__file__).resolve().parents[1] / name for name in
                                  ("phase1_deepfashion_best.pt", "phase2_pakistani_best.pt")],
                     progress=lambda x: print(json.dumps(x), flush=True))
    print(json.dumps({k: v for k, v in report.items() if k not in ("model_details", "sample_scores", "errors")}, indent=2))
    if args.dry_run_report:
        for sample in report["sample_scores"][:8]:
            print(json.dumps(sample), flush=True)


if __name__ == "__main__":
    main()
