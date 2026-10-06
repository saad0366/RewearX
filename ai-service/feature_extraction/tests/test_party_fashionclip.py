import csv
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from feature_extraction.training.phase3_party_fashionclip import (
    COMPETITORS, MODEL, OTHER_HEADS, OUTPUTS, PARTY, PROMPTS,
    candidates, collect, decision, sha256, calibrate, calibration_statistics, distribution)


class FakePredictor:
    metadata = {"model": "TEST_ONLY", "device": "test"}

    def __call__(self, images):
        return [[0.4, 0.4, 0.4, 0.4, 0.2, 0.2, 0.2, 0.2] for _ in images]


class PartyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.phase3 = self.root / "phase3"
        self.phase3.mkdir()

    def image(self, name, color):
        path = self.source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (12, 12), color).save(path)
        return path

    def run_collect(self, **kwargs):
        return collect({"deepfashion_attribute": self.source}, self.phase3, FakePredictor(), **kwargs)

    def test_prompts_and_mean_grouping(self):
        self.assertEqual(len(PARTY), 4)
        self.assertEqual(PROMPTS, PARTY + tuple(COMPETITORS.values()))
        result = decision([.3, .4, .5, .6, .1, .2, .3, .2])
        self.assertAlmostEqual(result["party_group_score"], .45)
        self.assertTrue(result["accepted"])
        self.assertEqual(result["second_best_occasion"], "casual")

    def test_top_rank_and_ties(self):
        for rival in [.4, .5]:
            result = decision([.4] * 4 + [rival, .1, .1, .1])
            self.assertFalse(result["party_top"])
            self.assertIn("not_party_top", result["reasons"])

    def test_margin_boundary(self):
        self.assertTrue(decision([.4] * 4 + [.2, .32, .1, .1])["accepted"])
        self.assertIn("insufficient_margin", decision([.4] * 4 + [.2, .32001, .1, .1])["reasons"])

    def test_three_prompt_consensus(self):
        self.assertTrue(decision([.5, .5, .5, .1] + [.2] * 4)["accepted"])
        r = decision([.7, .7, .1, .1] + [.2] * 4)
        self.assertGreater(r["score_margin"], .08)
        self.assertIn("insufficient_agreement", r["reasons"])

    def test_wedding_nearby(self):
        self.assertIn("wedding_too_close", decision([.4] * 4 + [.37, .1, .1, .1])["reasons"])
        self.assertNotIn("wedding_too_close", decision([.4] * 4 + [.369, .1, .1, .1])["reasons"])

    def test_invalid_scores(self):
        for scores in [[.2] * 7, [float("nan")] * 8, [1.1] * 8]:
            with self.assertRaises(ValueError):
                decision(scores)

    def test_labels_byte_duplicates_and_product_views(self):
        first = self.image("item1/1.png", "red")
        duplicate = self.source / "duplicate.png"
        duplicate.write_bytes(first.read_bytes())
        self.image("item1/2.png", "blue")
        self.image("item2/1.png", "green")
        report = self.run_collect()
        self.assertGreaterEqual(report["duplicate_images_skipped"] + report["duplicate_groups_skipped"], 1)
        with (self.phase3 / OUTPUTS[1]).open(newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(len({r["image_sha256"] for r in rows}), len(rows))
        self.assertEqual(len({r["source_group"] for r in rows}), len(rows))
        for row in rows:
            self.assertEqual(row["occasion"], "party")
            self.assertEqual(row["occasion_valid"], "1")
            self.assertEqual(row["pseudo_label_model"], MODEL)
            self.assertEqual(row["pseudo_label"], "1")
            self.assertEqual(row["needs_manual_review"], "1")
            self.assertEqual(sha256(self.phase3 / row["image_name"]), row["image_sha256"])
            for head in OTHER_HEADS:
                self.assertEqual(row[head], "")
                self.assertEqual(row[head + "_valid"], "0")

    def test_existing_phase3_image_and_manifest_exclusions(self):
        a = self.image("a.png", "red")
        b = self.image("b.png", "blue")
        c = self.image("c.png", "green")
        self.image("d.png", "yellow")
        (self.phase3 / "existing.png").write_bytes(a.read_bytes())
        existing = self.phase3 / "old_manifest.csv"
        existing.write_text("source_dataset,source_id,image_sha256\n"
                            f"unknown,unknown,{sha256(b)}\n"
                            "deepfashion_attribute,c.png,\n", encoding="utf-8")
        prior = {p: sha256(p) for p in self.phase3.iterdir()}
        report = self.run_collect()
        self.assertEqual(report["final_unique_party_count"], 1)
        self.assertEqual(report["duplicate_images_skipped"], 2)
        self.assertEqual(report["duplicate_source_ids_skipped"], 1)
        self.assertEqual(prior, {p: sha256(p) for p in prior})

    def test_deterministic_order_and_selection(self):
        for i in range(10):
            self.image(f"{i}.png", (i * 20, 0, 0))
        sources = {"deepfashion_attribute": self.source}
        self.assertEqual(candidates(sources, self.phase3, 42), candidates(sources, self.phase3, 42))
        self.assertNotEqual(candidates(sources, self.phase3, 42), candidates(sources, self.phase3, 43))
        a = self.run_collect(target=3)
        manifest = (self.phase3 / OUTPUTS[1]).read_bytes()
        other = self.root / "other"
        collect(sources, other, FakePredictor(), target=3)
        self.assertEqual(manifest, (other / OUTPUTS[1]).read_bytes())
        self.assertEqual(a["final_unique_party_count"], 3)

    def test_no_overwrite(self):
        for name in OUTPUTS:
            path = self.phase3 / name
            path.write_text("protected", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                self.run_collect()
            self.assertEqual(path.read_text(), "protected")
            path.unlink()

    def test_dry_run_and_checkpoint_unchanged(self):
        self.image("a.png", "red")
        checkpoint = self.root / "checkpoint.pt"
        checkpoint.write_bytes(b"protected checkpoint fixture")
        digest = sha256(checkpoint)
        dest = self.root / "dry.json"
        result = self.run_collect(dry_run=dest, checkpoints=[checkpoint])
        self.assertEqual(result["images_saved"], 0)
        self.assertEqual(result["checkpoint_sha256"][str(checkpoint.resolve())], digest)
        self.assertEqual(sha256(checkpoint), digest)
        self.assertEqual(list(self.phase3.iterdir()), [])
        self.assertTrue(dest.exists())
        with self.assertRaises(FileExistsError):
            self.run_collect(dry_run=dest)

    def test_forbidden_source_and_bound(self):
        with self.assertRaises(ValueError):
            candidates({"bad": self.phase3}, self.phase3, 42)
        for i in range(5):
            self.image(f"{i}.png", (i * 20, 0, 0))
        result = self.run_collect(max_images=2)
        self.assertEqual(result["total_images_examined"], 2)
        self.assertFalse(result["source_pool_exhausted"])
        self.assertEqual(result["stop_reason"], "max_images")

    def test_inference_failure_does_not_label(self):
        class Failing(FakePredictor):
            def __call__(self, images):
                raise RuntimeError("test failure")
        self.image("a.png", "red")
        r = collect({"test": self.source}, self.phase3, Failing())
        self.assertEqual(r["inference_failures"], 1)
        self.assertEqual(r["final_unique_party_count"], 0)

    def test_calibration_exact_count_no_filter_or_image_copy(self):
        for i in range(7):
            self.image(f"{i}.png", (i * 20, 0, 0))
        output = self.root / "calibration"
        class LowScores(FakePredictor):
            def __call__(self, images):
                return [[.1] * 4 + [.3] * 4 for _ in images]
        checkpoint = self.root / "checkpoint.pt"
        checkpoint.write_bytes(b"unchanged")
        with patch("feature_extraction.training.phase3_party_fashionclip.decision", side_effect=AssertionError("no filtering")):
            result = calibrate({"test": self.source}, self.phase3, LowScores(), output,
                               count=5, batch_size=2, checkpoints=[checkpoint])
        with (output / "scores.csv").open(newline="") as stream:
            rows = list(csv.DictReader(stream))
        self.assertEqual(len(rows), 5)
        self.assertEqual(result["statistics"]["scored_count"], 5)
        self.assertEqual(result["statistics"]["party_top1_count"], 0)
        self.assertEqual(result["inference_attempted_images"], 5)
        self.assertFalse(result["acceptance_filter_applied"])
        self.assertEqual(result["images_copied"], 0)
        self.assertEqual(list(self.phase3.iterdir()), [])
        self.assertEqual({p.name for p in output.iterdir()}, {"scores.csv", "audit.json"})
        self.assertEqual(result["checkpoint_sha256_before"], result["checkpoint_sha256_after"])

    def test_calibration_batch_survives_interruption(self):
        for i in range(5):
            self.image(f"{i}.png", (i * 30, 0, 0))
        output = self.root / "calibration"
        case = self
        class Interrupting(FakePredictor):
            calls = 0
            def __call__(self, images):
                self.calls += 1
                if self.calls == 2:
                    with (output / "scores.csv").open(newline="") as stream:
                        case.assertEqual(len(list(csv.DictReader(stream))), 2)
                    raise KeyboardInterrupt()
                return super().__call__(images)
        with self.assertRaises(KeyboardInterrupt):
            calibrate({"test": self.source}, self.phase3, Interrupting(), output, count=5, batch_size=2)
        with (output / "scores.csv").open(newline="") as stream:
            self.assertEqual(len(list(csv.DictReader(stream))), 2)
        self.assertEqual(json.loads((output / "audit.json").read_text())["status"], "interrupted")

    def test_calibration_rule_comparison_and_percentiles(self):
        rows = [dict(party_top1=top, party_margin=m, party_prompt_agreement=a,
                     party_minus_wedding=w, party_group_score=.2)
                for top, m, a, w in [(1, .012, 3, .008), (1, .017, 2, .012),
                                     (1, .017, 3, .020), (0, .04, 4, .04)]]
        result = calibration_statistics(rows)
        self.assertEqual(result["party_top1_count"], 3)
        for rule, expected in {"A": 2, "B": 1, "C": 3, "D": 2}.items():
            self.assertEqual(result["candidate_rules"][rule]["accepted_count"], expected)
            self.assertEqual(result["candidate_rules"][rule]["percentage_of_all"], expected * 25)
            self.assertEqual(result["candidate_rules"][rule]["projected_per_10000"], expected * 2500)
        values = distribution([0, 1, 2, 3])
        self.assertEqual(values["p50"], 1.5)
        self.assertEqual(values["p75"], 2.25)
        self.assertAlmostEqual(values["p99"], 2.97)

    def test_calibration_exclusion_and_no_overwrite(self):
        first = self.image("a.png", "red")
        self.image("b.png", "blue")
        existing = self.phase3 / "old.png"
        existing.write_bytes(first.read_bytes())
        digest = sha256(existing)
        output = self.root / "calibration"
        result = calibrate({"test": self.source}, self.phase3, FakePredictor(), output, count=1)
        self.assertEqual(result["statistics"]["scored_count"], 1)
        with (output / "scores.csv").open(newline="") as stream:
            rows = list(csv.DictReader(stream))
        self.assertNotEqual(rows[0]["image_sha256"], digest)
        self.assertEqual(sha256(existing), digest)
        before = {p.name: sha256(p) for p in output.iterdir()}
        with self.assertRaises(FileExistsError):
            calibrate({"test": self.source}, self.phase3, FakePredictor(), output, count=1)
        self.assertEqual(before, {p.name: sha256(p) for p in output.iterdir()})

    def test_calibration_replenishes_failed_scores(self):
        for i in range(5):
            self.image(f"{i}.png", (i * 30, 0, 0))
        class FailFirst(FakePredictor):
            calls = 0
            def __call__(self, images):
                self.calls += 1
                return [[float("nan")] * 8] if self.calls == 1 else super().__call__(images)
        result = calibrate({"test": self.source}, self.phase3, FailFirst(), self.root / "calibration",
                           count=3, batch_size=1)
        self.assertEqual(result["statistics"]["scored_count"], 3)
        self.assertEqual(result["inference_failures"], 1)
        self.assertEqual(result["inference_attempted_images"], 4)


if __name__ == "__main__":
    unittest.main()
