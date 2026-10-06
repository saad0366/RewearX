"""Resumable, provisional Rule B collection from calibration and new local images."""

import argparse
from collections import Counter
import csv
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import random
import sqlite3
import textwrap
import time

from PIL import Image, ImageDraw, ImageFont, ImageOps

from .phase3_party_fashionclip import (
    MODEL, REVISION, PROMPTS, SCORE_FIELDS, FIELDS, OTHER_HEADS, FashionClip,
    candidates, existing_exclusions, protected_inventory, score_metrics, sha256,
    distribution, write_audit)

RULE = {"party_top1": True, "minimum_margin": 0.015, "minimum_agreement": 3, "minimum_wedding_gap": 0.0075}
OUTPUTS = ("party_fashionclip", "party_fashionclip_manifest.csv", "party_fashionclip_audit.json",
           "party_fashionclip_contact_sheet.jpg")
MANIFEST_FIELDS = tuple(dict.fromkeys(FIELDS + SCORE_FIELDS + (
    "score_origin", "label_status", "training_approved", "pseudo_label_model_revision", "selection_rule")))
JOURNAL_FIELDS = SCORE_FIELDS + ("status", "error")


def same_metadata(live, saved):
    # Official CLIP processor exposes mean/std tuples; JSON stores them as lists.
    # Compare their JSON representation without altering the processor itself.
    return json.loads(json.dumps(live)) == saved


def matches(row):
    return (int(row["party_top1"]) == 1 and float(row["party_margin"]) >= .015
            and int(row["party_prompt_agreement"]) >= 3 and float(row["party_minus_wedding"]) >= .0075)


def identity(row):
    return row["source_dataset"].casefold(), row["source_id"]


def group_key(row):
    return row["source_dataset"].casefold(), row["source_group"]


def scored_row(source, digest, scores):
    m = score_metrics(scores)
    return {**source, "image_sha256": digest, **{k: v for k, v in m.items() if k in SCORE_FIELDS},
            "party_margin": m["score_margin"], "party_minus_wedding": m["party_group_score"] - m["wedding_score"],
            "party_top1": int(m["party_top"]), "status": "ok", "error": ""}


def validate_scores(row):
    m = score_metrics([float(row[f"party_prompt_{n}_score"]) for n in range(1, 5)] +
                      [float(row[k + "_score"]) for k in ("wedding", "formal", "casual", "sports")])
    for name, expected in (("party_group_score", m["party_group_score"]), ("party_margin", m["score_margin"]),
                           ("party_minus_wedding", m["party_group_score"] - m["wedding_score"]),
                           ("second_best_score", m["second_best_score"])):
        if abs(float(row[name]) - expected) > 1e-10:
            raise ValueError(f"Inconsistent saved score: {name}")
    if int(row["party_top1"]) != int(m["party_top"]) or int(row["party_prompt_agreement"]) != m["party_prompt_agreement"]:
        raise ValueError("Inconsistent saved ranking/agreement")


def select_saved(calibration, records, exclusions, target):
    hashes, ids, paths, groups = (set(x) for x in exclusions)
    chosen = []
    rejected = Counter()
    passing = Counter()
    for origin, pool in (("calibration", calibration), ("continuation", records)):
        for row in pool:
            if row.get("status", "ok") != "ok" or not matches(row):
                continue
            passing[origin] += 1
            if row["image_sha256"] in hashes:
                rejected["accepted_hash_duplicates"] += 1
            elif identity(row) in ids or row["source_path"].casefold() in paths:
                rejected["accepted_source_duplicates"] += 1
            elif group_key(row) in groups:
                rejected["accepted_group_duplicates"] += 1
            elif len(chosen) < target:
                chosen.append({**row, "score_origin": origin})
                hashes.add(row["image_sha256"])
                ids.add(identity(row))
                paths.add(row["source_path"].casefold())
                groups.add(group_key(row))
    return chosen, dict(rejected), dict(passing)


def dump_csv(path, fields, rows):
    with Path(path).open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        stream.flush()
        os.fsync(stream.fileno())


def contact_sheet(rows, root, output, sample_csv, seed=42):
    sample = random.Random(seed).sample(rows, min(100, len(rows)))
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
        heading = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 24)
    except OSError:
        font = ImageFont.load_default(size=16)
        heading = ImageFont.load_default(size=24)
    lines = max((len(textwrap.wrap(r["source_id"], 37)) for r in sample), default=1)
    width, height, columns = 320, 270 + 20 * (lines + 3), 10
    canvas = Image.new("RGB", (width * columns, 70 + height * max(1, (len(sample) + columns - 1) // columns)), "white")
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 8), "Rule B PARTY candidates - PROVISIONAL / NOT TRAINING-APPROVED", fill="black", font=heading)
    draw.text((12, 40), f"Uniform random sample; seed={seed}; n={len(sample)}. Scores are cosine similarities, not probabilities.", fill="black", font=font)
    for index, row in enumerate(sample):
        x, y = (index % columns) * width, 70 + (index // columns) * height
        with Image.open(Path(root) / row["image_name"]) as image:
            thumb = ImageOps.contain(image.convert("RGB"), (300, 220))
            canvas.paste(thumb, (x + (width - thumb.width) // 2, y + 4))
        text = [f"#{index + 1:03d} {row['source_dataset']}", *textwrap.wrap(row["source_id"], 37),
                f"party={float(row['party_group_score']):.4f} margin={float(row['party_margin']):.4f}",
                f"wedding gap={float(row['party_minus_wedding']):.4f} agree={row['party_prompt_agreement']}/4"]
        draw.multiline_text((x + 6, y + 230), "\n".join(text), fill="black", font=font, spacing=3)
        draw.rectangle((x, y, x + width - 1, y + height - 1), outline="#cccccc")
    canvas.save(output, quality=92)
    dump_csv(sample_csv, ("tile",) + MANIFEST_FIELDS, [{"tile": i + 1, **r} for i, r in enumerate(sample)])
    return {"count": len(sample), "seed": seed, "strategy": "uniform random sample without replacement",
            "source_distribution": dict(Counter(r["source_dataset"] for r in sample)),
            "cell_width": width, "cell_height": height, "header_height": 70, "columns": columns}


def provisional_row(row):
    result = {k: "" for k in MANIFEST_FIELDS}
    result.update({k: v for k, v in row.items() if k in MANIFEST_FIELDS})
    extension = Path(row["source_path"]).suffix.lower()
    result.update(image_name=f"party_fashionclip/{row['image_sha256']}{extension}",
                  score_margin=row["party_margin"], occasion="party", occasion_valid=1,
                  pseudo_label=1, pseudo_label_model=MODEL, pseudo_label_model_revision=REVISION,
                  needs_manual_review=1, label_status="provisional", training_approved=0, selection_rule="B")
    result.update({h + "_valid": 0 for h in OTHER_HEADS})
    return result


def run(sources, phase3, calibration_dir, work, predictor_factory, *, target=500, seed=42,
        batch_size=16, checkpoints=(), resume=False, progress=None):
    started = time.perf_counter()
    root, work, calibration_dir = map(lambda p: Path(p).resolve(), (phase3, work, calibration_dir))
    if min(target, batch_size) <= 0:
        raise ValueError("Positive target and batch size required")
    for name in OUTPUTS:
        if (root / name).exists():
            raise FileExistsError(f"Final output exists; never overwrite: {root / name}")
    for p in (root, calibration_dir, *(Path(p).resolve() for p in sources.values())):
        if work.is_relative_to(p) or p.is_relative_to(work):
            raise ValueError("Continuation state must be separate from datasets/calibration")
    calibration_audit = json.loads((calibration_dir / "audit.json").read_text(encoding="utf-8"))
    calibration_hash = sha256(calibration_dir / "scores.csv")
    if calibration_hash != calibration_audit["scores_sha256"]:
        raise ValueError("Calibration CSV integrity check failed")
    model_details = calibration_audit["model_details"]
    if model_details["model_revision"] != REVISION or model_details["prompts"] != list(PROMPTS):
        raise ValueError("Calibration model/prompts differ")
    with (calibration_dir / "scores.csv").open(newline="", encoding="utf-8") as stream:
        calibration = list(csv.DictReader(stream))
    if len(calibration) != calibration_audit["statistics"]["scored_count"]:
        raise ValueError("Calibration row count mismatch")
    for row in calibration:
        validate_scores(row)
    config = {"sources": {k: str(Path(v).resolve()) for k, v in sources.items()}, "phase3": str(root),
              "calibration_hash": calibration_hash, "target": target, "seed": seed,
              "batch_size": batch_size, "rule": RULE, "revision": REVISION}
    if resume:
        if not (work / "state.sqlite3").is_file():
            raise FileNotFoundError("No continuation state to resume")
    else:
        work.mkdir(parents=True, exist_ok=False)
    database = sqlite3.connect(work / "state.sqlite3")
    database.execute("PRAGMA synchronous=FULL")
    database.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    database.execute("CREATE TABLE IF NOT EXISTS scores (seq INTEGER PRIMARY KEY, dataset TEXT, source_id TEXT, payload TEXT, UNIQUE(dataset,source_id))")
    def get(key):
        value = database.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return json.loads(value[0]) if value else None
    def put(key, value):
        database.execute("INSERT OR REPLACE INTO meta VALUES (?,?)", (key, json.dumps(value)))
    if resume:
        if get("config") != config:
            database.close()
            raise ValueError("Resume configuration changed")
        before = get("protected")
        if before is None:
            raise ValueError("Initialization incomplete; inspect state before resuming")
    else:
        before = protected_inventory(root, checkpoints)
        before.update({str(calibration_dir / name): sha256(calibration_dir / name) for name in ("scores.csv", "audit.json")})
        with database:
            put("config", config)
            put("protected", before)
            put("state", {"cursor": 0, "counters": {}, "runtime_seconds": 0, "inference_seconds": 0})
    for name, digest in before.items():
        if sha256(name) != digest:
            raise RuntimeError(f"Protected source changed: {name}")
    state = get("state")
    previous_runtime = state["runtime_seconds"]
    records = [json.loads(r[0]) for r in database.execute("SELECT payload FROM scores ORDER BY seq")]
    # SQLite is the durable authority. Rebuild only our own derived CSV on resume,
    # including any committed batch whose CSV append was interrupted.
    dump_csv(work / "scores.csv", JOURNAL_FIELDS, records)
    exclusions = existing_exclusions(root, before)
    chosen, selection_duplicates, passing = select_saved(calibration, records, exclusions, target)
    all_scored = calibration + records
    seen_ids = {identity(r) for r in all_scored}
    seen_paths = {r["source_path"].casefold() for r in all_scored}
    seen_groups = set(exclusions[3]) | {group_key(r) for r in all_scored}
    seen_hashes = set(exclusions[0]) | {r["image_sha256"] for r in all_scored if r.get("image_sha256")}
    counters = Counter(state["counters"])
    pool = candidates(sources, root, seed)
    report = {}
    def checkpoint(status):
        report.update(status=status, training_approved=False, label_status="provisional", selected_rule="B", rule=RULE,
                      target=target, candidates_accepted=len(chosen), shortage=max(0, target - len(chosen)),
                      reused_calibration_scores=len(calibration), new_images_examined=len(records),
                      new_successfully_scored=sum(r["status"] == "ok" for r in records),
                      counters=dict(counters), selection_duplicates=selection_duplicates, rule_passing_counts=passing,
                      runtime_seconds=previous_runtime + time.perf_counter() - started,
                      inference_seconds=state["inference_seconds"], source_cursor=state["cursor"],
                      source_pool_size=len(pool), source_distribution=dict(Counter(r["source_dataset"] for r in chosen)),
                      model_details=model_details, seed=seed, batch_size=batch_size,
                      party_score_distribution=distribution([float(r["party_group_score"]) for r in chosen]),
                      margin_distribution=distribution([float(r["party_margin"]) for r in chosen]),
                      wedding_gap_distribution=distribution([float(r["party_minus_wedding"]) for r in chosen]),
                      prompt_agreement_counts=dict(Counter(str(r["party_prompt_agreement"]) for r in chosen)),
                      quality_warnings=["Pseudo-label candidates only; not ground truth or training-approved",
                                        "Cosine similarity is not calibrated label accuracy",
                                        "Product groups are filename/directory heuristics; perceptual duplicates may remain",
                                        "Wedding, casual, formal and ambiguous products require visual review"])
        state.update(counters=dict(counters), runtime_seconds=report["runtime_seconds"])
        with database:
            put("state", state)
        write_audit(work / "progress.json", report)
        if progress:
            progress({"new_examined": len(records), "reused": len(calibration), "accepted": len(chosen),
                      "cursor": state["cursor"], "failures": counters["inference_failures"]})
    checkpoint("running")
    predictor = None
    try:
        if len(chosen) < target:
            predictor = predictor_factory()
            for key in ("model_revision", "prompts", "similarity", "processor_config", "model_files_sha256"):
                if not same_metadata(predictor.metadata.get(key), model_details.get(key)):
                    raise ValueError(f"Model setting changed: {key}")
        with (work / "scores.csv").open("a", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=JOURNAL_FIELDS, extrasaction="ignore")
            while state["cursor"] < len(pool) and len(chosen) < target:
                pending, images, completed = [], [], []
                cursor = state["cursor"]
                while cursor < len(pool) and len(pending) < batch_size:
                    source = pool[cursor]
                    cursor += 1
                    key, group = identity(source), group_key(source)
                    if key in seen_ids or source["source_path"].casefold() in seen_paths:
                        counters["previously_scored_skips"] += 1
                        continue
                    if key in exclusions[1] or source["source_path"].casefold() in exclusions[2]:
                        counters["existing_phase3_source_skips"] += 1
                        continue
                    if group in seen_groups:
                        counters["product_group_skips"] += 1
                        continue
                    try:
                        path = Path(source["source_path"]).resolve()
                        if not path.is_relative_to(Path(sources[source["source_dataset"]]).resolve()) or path.is_relative_to(root):
                            raise ValueError("Unsafe source path")
                        raw = path.read_bytes()
                        digest = hashlib.sha256(raw).hexdigest()
                        if digest in seen_hashes:
                            counters["byte_duplicate_skips"] += 1
                            continue
                        with Image.open(BytesIO(raw)) as image:
                            image.load()
                            images.append(image.copy())
                        pending.append((source, digest))
                        seen_hashes.add(digest)
                    except (OSError, ValueError, Image.DecompressionBombError) as exc:
                        counters["image_read_failures"] += 1
                        completed.append({**source, "image_sha256": "", "status": "read_error", "error": str(exc)})
                    seen_ids.add(key)
                    seen_paths.add(source["source_path"].casefold())
                    seen_groups.add(group)
                if pending:
                    begin = time.perf_counter()
                    batch_error = "Invalid model output"
                    try:
                        values = predictor(images)
                        if len(values) != len(pending):
                            raise ValueError("Batch length mismatch")
                    except Exception as exc:
                        values = [None] * len(pending)
                        batch_error = str(exc)
                    finally:
                        state["inference_seconds"] += time.perf_counter() - begin
                        for image in images:
                            image.close()
                    for (source, digest), scores in zip(pending, values):
                        try:
                            completed.append(scored_row(source, digest, scores))
                        except (TypeError, ValueError) as exc:
                            counters["inference_failures"] += 1
                            completed.append({**source, "image_sha256": digest, "status": "inference_error",
                                              "error": batch_error if scores is None else str(exc)})
                state["cursor"] = cursor
                state["counters"] = dict(counters)
                # Commit scores and cursor together before printing progress or copying images.
                with database:
                    for row in completed:
                        database.execute("INSERT INTO scores(dataset,source_id,payload) VALUES (?,?,?)",
                                         (*identity(row), json.dumps(row)))
                    put("state", state)
                records.extend(completed)
                writer.writerows(completed)
                stream.flush()
                os.fsync(stream.fileno())
                chosen, selection_duplicates, passing = select_saved(calibration, records, exclusions, target)
                checkpoint("running")
        for name, digest in before.items():
            if sha256(name) != digest:
                raise RuntimeError(f"Protected source changed: {name}")
        checkpoint("scoring_complete")
        report.update(protected_files_verified_unchanged=len(before),
                      checkpoint_sha256={str(Path(p).resolve()): sha256(p) for p in checkpoints},
                      checkpoint_hashes_unchanged=True, source_pool_exhausted=state["cursor"] == len(pool),
                      visual_review={"status": "pending", "training_approved": False})
        stage = work / "publication"
        stage.mkdir(exist_ok=True)
        (stage / OUTPUTS[0]).mkdir(exist_ok=True)
        manifest = [provisional_row(r) for r in chosen]
        for row in manifest:
            source = Path(row["source_path"]).resolve()
            if not source.is_relative_to(Path(sources[row["source_dataset"]]).resolve()) or source.is_relative_to(root):
                raise ValueError("Unsafe source during publication")
            raw = source.read_bytes()
            if hashlib.sha256(raw).hexdigest() != row["image_sha256"]:
                raise RuntimeError("Source image changed since scoring")
            dest = stage / row["image_name"]
            if dest.exists():
                if sha256(dest) != row["image_sha256"]:
                    raise RuntimeError("Staging image mismatch")
            else:
                with dest.open("xb") as stream:
                    stream.write(raw)
        dump_csv(stage / OUTPUTS[1], MANIFEST_FIELDS, manifest)
        report["contact_sheet"] = contact_sheet(manifest, stage, stage / OUTPUTS[3], work / "contact_sheet_samples.csv", seed)
        report["status"] = "provisional_candidates_pending_review"
        report["runtime_seconds"] = previous_runtime + time.perf_counter() - started
        write_audit(stage / OUTPUTS[2], report)
        for name in OUTPUTS:
            if (root / name).exists():
                raise FileExistsError(f"Refusing publication overwrite: {name}")
        published = []
        try:
            for name in OUTPUTS:
                (stage / name).rename(root / name)
                published.append(name)
        except BaseException:
            for name in reversed(published):
                (root / name).rename(stage / name)
            raise
        write_audit(work / "progress.json", report)
        return report
    finally:
        database.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase3-root", default="../datasets/phase3_rewearx")
    parser.add_argument("--calibration-dir", default="../artifacts/party_fashionclip_calibration")
    parser.add_argument("--work-dir", default="../artifacts/party_fashionclip_rule_b")
    parser.add_argument("--deepfashion-root", default="../datasets/deepfashion_attribute/img")
    parser.add_argument("--pakistani-root", default="../datasets/pakistani_fashion/train")
    parser.add_argument("--model-dir", default="../artifacts/fashionclip_model")
    parser.add_argument("--target", type=int, default=500)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args(argv)
    report = run({"deepfashion_attribute": args.deepfashion_root, "pakistani_fashion": args.pakistani_root},
                 args.phase3_root, args.calibration_dir, args.work_dir, lambda: FashionClip(args.model_dir),
                 target=args.target, batch_size=args.batch_size, seed=args.seed, resume=args.resume,
                 checkpoints=[Path(__file__).resolve().parents[1] / name for name in
                              ("phase1_deepfashion_best.pt", "phase2_pakistani_best.pt")],
                 progress=lambda value: print(json.dumps(value), flush=True))
    print(json.dumps({k: v for k, v in report.items() if k != "model_details"}, indent=2))


if __name__ == "__main__":
    main()
