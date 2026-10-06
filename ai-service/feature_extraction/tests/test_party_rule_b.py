import csv
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from feature_extraction.training.phase3_party_fashionclip import MODEL, REVISION, PROMPTS, SCORE_FIELDS, sha256
from feature_extraction.training.phase3_party_rule_b import (
    OUTPUTS, matches, scored_row, run, dump_csv, select_saved, provisional_row, same_metadata)

META = {"model": MODEL, "model_revision": REVISION, "prompts": list(PROMPTS),
        "similarity": "test", "processor_config": {}, "model_files_sha256": {}}


class Predictor:
    metadata = META
    def __init__(self, stop_after=None):
        self.calls = 0
        self.stop_after = stop_after
    def __call__(self, images):
        self.calls += 1
        if self.stop_after is not None and self.calls > self.stop_after:
            raise KeyboardInterrupt()
        return [[.4] * 4 + [.38] * 4 for _ in images]


class RuleBTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.images = self.root / "source"
        self.images.mkdir()
        self.phase3 = self.root / "phase3"
        self.phase3.mkdir()
        self.cal = self.root / "calibration"
        self.cal.mkdir()
        self.work = self.root / "work"
        self.ckpt = self.root / "checkpoint.pt"
        self.ckpt.write_bytes(b"must not change")

    def source(self, name, color):
        path = self.images / name
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (16, 20), color).save(path)
        return {"source_dataset": "test", "source_path": str(path), "source_id": name,
                "source_group": path.stem}

    def calibration(self, sources, passes=True):
        scores = [.4] * 4 + [.38] * 4 if passes else [.1] * 4 + [.3] * 4
        rows = [scored_row(s, sha256(s["source_path"]), scores) for s in sources]
        dump_csv(self.cal / "scores.csv", SCORE_FIELDS, rows)
        (self.cal / "audit.json").write_text(json.dumps({"scores_sha256": sha256(self.cal / "scores.csv"),
                                                       "model_details": META, "statistics": {"scored_count": len(rows)}}))
        return rows

    def execute(self, factory, **kwargs):
        return run({"test": self.images}, self.phase3, self.cal, self.work, factory,
                   checkpoints=[self.ckpt], batch_size=1, **kwargs)

    def test_rule_b_exact_boundaries(self):
        row = dict(party_top1=1, party_margin=.015, party_prompt_agreement=3, party_minus_wedding=.0075)
        self.assertTrue(matches(row))
        for key, value in [("party_top1", 0), ("party_margin", .014999),
                           ("party_prompt_agreement", 2), ("party_minus_wedding", .007499)]:
            self.assertFalse(matches({**row, key: value}))

    def test_processor_metadata_json_roundtrip(self):
        self.assertTrue(same_metadata({"image_mean": (.1, .2, .3)}, {"image_mean": [.1, .2, .3]}))
        self.assertFalse(same_metadata({"image_mean": (.1, .2, .4)}, {"image_mean": [.1, .2, .3]}))

    def test_calibration_reused_without_loading_model(self):
        source = self.source("cal.png", "red")
        self.calibration([source])
        digest = sha256(self.ckpt)
        def forbidden():
            self.fail("Calibration must not be re-inferred")
        report = self.execute(forbidden, target=1)
        self.assertEqual(report["new_images_examined"], 0)
        self.assertEqual(report["reused_calibration_scores"], 1)
        self.assertEqual(report["candidates_accepted"], 1)
        self.assertFalse(report["training_approved"])
        self.assertEqual(sha256(self.ckpt), digest)
        with (self.phase3 / OUTPUTS[1]).open(newline="") as stream:
            row = next(csv.DictReader(stream))
        for head in ("color", "season", "pattern", "category", "sleeve_length"):
            self.assertEqual(row[head + "_valid"], "0")
            self.assertEqual(row[head], "")
        self.assertEqual(row["occasion"], "party")
        self.assertEqual(row["pseudo_label"], "1")
        self.assertEqual(row["training_approved"], "0")
        self.assertEqual(row["label_status"], "provisional")
        self.assertTrue((self.phase3 / OUTPUTS[3]).is_file())

    def test_resume_preserves_committed_scores_and_deterministic_result(self):
        source = self.source("cal.png", "red")
        self.calibration([source], passes=False)
        for i in range(6):
            self.source(f"new{i}.png", (i * 30, 20, 50))
        with self.assertRaises(KeyboardInterrupt):
            self.execute(lambda: Predictor(stop_after=2), target=4)
        with (self.work / "scores.csv").open(newline="") as stream:
            saved = list(csv.DictReader(stream))
        self.assertEqual(len(saved), 2)
        self.assertFalse(any((self.phase3 / n).exists() for n in OUTPUTS))
        next_predictor = Predictor()
        report = self.execute(lambda: next_predictor, target=4, resume=True)
        self.assertEqual(next_predictor.calls, 2)
        self.assertEqual(report["candidates_accepted"], 4)
        with (self.work / "scores.csv").open(newline="") as stream:
            resumed = list(csv.DictReader(stream))
        self.assertEqual(resumed[:2], saved)
        self.assertEqual(len({r['source_id'] for r in resumed}), 4)
        other_phase3, other_work = self.root / "other_phase3", self.root / "other_work"
        other_phase3.mkdir()
        run({"test": self.images}, other_phase3, self.cal, other_work, Predictor,
            target=4, batch_size=1, checkpoints=[self.ckpt])
        self.assertEqual((other_phase3 / OUTPUTS[1]).read_bytes(), (self.phase3 / OUTPUTS[1]).read_bytes())

    def test_saved_duplicate_hash_and_product_group_exclusion(self):
        sources = [self.source(f"{i}.png", (i * 30, 10, 20)) for i in range(3)]
        rows = self.calibration(sources)
        rows[1]["source_group"] = rows[0]["source_group"]
        rows[2]["image_sha256"] = rows[0]["image_sha256"]
        chosen, counters, passing = select_saved(rows, [], (set(), set(), set(), set()), 500)
        self.assertEqual(len(chosen), 1)
        self.assertEqual(counters["accepted_group_duplicates"], 1)
        self.assertEqual(counters["accepted_hash_duplicates"], 1)
        excluded = select_saved(rows, [], ({rows[0]["image_sha256"]}, set(), set(), set()), 500)[0]
        self.assertTrue(all(r["image_sha256"] != rows[0]["image_sha256"] for r in excluded))

    def test_no_overwrite_existing_outputs(self):
        self.calibration([self.source("a.png", "red")])
        protected = self.phase3 / OUTPUTS[1]
        protected.write_bytes(b"existing")
        with self.assertRaises(FileExistsError):
            self.execute(Predictor, target=1)
        self.assertEqual(protected.read_bytes(), b"existing")

    def test_source_exhaustion_does_not_relax_rule(self):
        self.calibration([self.source("a.png", "red")], passes=False)
        report = self.execute(Predictor, target=2)
        self.assertEqual(report["candidates_accepted"], 0)
        self.assertEqual(report["shortage"], 2)
        self.assertTrue(report["source_pool_exhausted"])


if __name__ == "__main__":
    unittest.main()
