"""Offline streaming fixtures: no network, training, or production images."""

import csv
import json
import os
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

from feature_extraction.training.phase3_hf_fashion import collect, labels_for, OUTPUTS, continue_formal, PINNED_REVISION


def row(index, season="Summer", usage="Casual", identifier=True):
    stream = BytesIO()
    Image.new("RGB", (8, 8), (index % 256, index // 256, 100)).save(stream, format="PNG")
    result = {"image": {"bytes": stream.getvalue()}, "season": season, "usage": usage,
              "baseColour": "Black", "category": "shirt"}
    if identifier:
        result["id"] = index
    return result


class MappingTests(unittest.TestCase):
    def test_safe_seasons(self):
        for source, target in (("Summer", "summer"), ("Winter", "winter")):
            self.assertEqual(labels_for({"season": source})["season"], target)

    def test_safe_occasions(self):
        for source, target in (("Casual", "casual"), ("Formal", "formal"), ("Sports", "sports")):
            self.assertEqual(labels_for({"usage": source})["occasion"], target)

    def test_ignored_values(self):
        for value in ("Spring", "Fall", "", None, "summer", "All Season"):
            self.assertIsNone(labels_for({"season": value})["season"])
        for value in ("Smart Casual", "Ethnic", "Travel", "NA", "", None, "Wedding", "Party"):
            self.assertIsNone(labels_for({"usage": value})["occasion"])


class CollectorTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def manifest(self, root):
        with (root / OUTPUTS[1]).open(newline="", encoding="utf-8") as stream:
            return list(csv.DictReader(stream))

    def test_deterministic_seed_and_masks(self):
        data = [row(i, "Summer" if i % 2 else "Winter", ("Casual", "Formal", "Sports")[i % 3]) for i in range(60)]
        a = collect(iter(data), self.root / "a", target=3, seed=42)
        b = collect(iter(data), self.root / "b", target=3, seed=42)
        collect(iter(data), self.root / "c", target=3, seed=43)
        self.assertEqual(a, b)
        self.assertEqual(self.manifest(self.root / "a"), self.manifest(self.root / "b"))
        self.assertNotEqual(self.manifest(self.root / "a"), self.manifest(self.root / "c"))
        self.assertEqual(a["stop_reason"], "targets_met")
        self.assertFalse(any(a["shortages"].values()))
        self.assertLessEqual(a["images_saved"], 15)
        for item in self.manifest(self.root / "a"):
            self.assertEqual(item["needs_manual_review"], "1")
            for head in ("color", "category", "sleeve_length", "pattern"):
                self.assertEqual(item[head], "")
                self.assertEqual(item[head + "_valid"], "0")

    def test_id_and_hash_deduplication(self):
        original = row(1)
        same_id = row(2)
        same_id["id"] = 1
        no_id = row(3, identifier=False)
        same_bytes_other_id = {**original, "id": 4}
        result = collect([original, same_id, no_id, dict(no_id), same_bytes_other_id], self.root, target=10, batch_size=1)
        self.assertEqual(result["images_saved"], 2)
        self.assertEqual(result["duplicates_skipped"], 3)
        self.assertTrue(self.manifest(self.root)[1]["source_id"].startswith("sha256:"))

    def test_exhaustion_and_shortages(self):
        result = collect([row(1, "Spring", "Formal"), row(2, "Winter", "Travel"), row(3, "Fall", "NA")], self.root, target=2)
        self.assertEqual(result["images_saved"], 2)
        self.assertEqual(result["stop_reason"], "dataset_exhausted")
        self.assertEqual(result["shortages"], {"summer": 2, "winter": 1, "casual": 2, "formal": 1, "sports": 2})
        manifest = self.manifest(self.root)
        self.assertEqual(manifest[0]["season_valid"], "0")
        self.assertEqual(manifest[1]["occasion_valid"], "0")

    def test_no_overwrite_before_iteration_and_explicit_backup(self):
        collect([row(1)], self.root, target=1)
        original = (self.root / OUTPUTS[1]).read_bytes()
        unrelated = self.root / "labels.csv"
        unrelated.write_text("keep")
        def forbidden():
            raise AssertionError("Must not request stream rows")
            yield
        with self.assertRaises(FileExistsError):
            collect(forbidden(), self.root)
        self.assertEqual((self.root / OUTPUTS[1]).read_bytes(), original)
        result = collect([row(2)], self.root, target=1, overwrite=True)
        self.assertEqual((Path(result["previous_outputs_backup"]) / OUTPUTS[1]).read_bytes(), original)
        self.assertEqual(unrelated.read_text(), "keep")

    def test_scan_and_byte_limits_stop_consumption(self):
        data = [row(i) for i in range(10)]
        result = collect(iter(data), self.root / "rows", target=20, max_rows=2)
        self.assertEqual(result["rows_scanned"], 2)
        self.assertEqual(result["stop_reason"], "max_rows")
        result = collect(iter(data), self.root / "bytes", target=20, max_stream_bytes=1)
        self.assertEqual(result["rows_scanned"], 1)
        self.assertEqual(result["stop_reason"], "stream_image_byte_limit")

    def test_corrupt_images_and_network_error_audited(self):
        broken = row(1)
        broken["image"]["bytes"] = b"not an image"
        def stream():
            yield broken
            yield row(2)
            raise OSError("fixture disconnect")
        result = collect(stream(), self.root)
        self.assertEqual(result["images_saved"], 1)
        self.assertEqual(len(result["invalid_images"]), 1)
        self.assertEqual(result["stop_reason"], "stream_error")
        self.assertIn("fixture disconnect", result["stream_error"])

    def initial_collection(self):
        collect([row(1, usage="Formal"), row(2, usage="Casual")], self.root,
                target=20, revision=PINNED_REVISION)
        return {p: p.read_bytes() for p in (self.root / OUTPUTS[0]).iterdir()}

    def test_formal_continuation_excludes_ids_hashes_and_preserves_bytes(self):
        original_images = self.initial_collection()
        before_csv = (self.root / OUTPUTS[1]).read_bytes()
        old_rows = self.manifest(self.root)
        duplicate_id = row(90, usage="Formal")
        duplicate_id["id"] = 1
        duplicate_hash = {**row(2, usage="Formal"), "id": 91}
        data = [row(3, usage="Casual"), duplicate_id, duplicate_hash,
                {**row(4, "Winter", "Formal"), "_source_row_index": 500},
                {**row(5, "Spring", "Formal", identifier=False), "_source_row_index": 700},
                row(6, usage="Formal")]
        report = continue_formal(data, self.root, new_target=2)
        self.assertEqual(report["new_formal_images"], 2)
        self.assertEqual(report["final_formal"], 3)
        self.assertEqual(report["rows_scanned"], 5)
        self.assertEqual(report["duplicates_skipped"], 2)
        self.assertEqual(report["ignored_nonformal_rows"], 1)
        self.assertTrue((self.root / OUTPUTS[1]).read_bytes().startswith(before_csv))
        new_rows = self.manifest(self.root)
        self.assertEqual(new_rows[:2], old_rows)
        self.assertEqual([r["source_row_index"] for r in new_rows[2:]], ["500", "700"])
        self.assertEqual(new_rows[2]["season"], "winter")
        self.assertEqual(new_rows[3]["season_valid"], "0")
        for r in new_rows[2:]:
            self.assertEqual(r["source_usage"], "Formal")
            self.assertEqual(r["occasion_valid"], "1")
            for head in ("color", "category", "pattern", "sleeve_length"):
                self.assertEqual(r[head + "_valid"], "0")
        for path, content in original_images.items():
            self.assertEqual(path.read_bytes(), content)
        audit = json.loads((self.root / OUTPUTS[2]).read_text())
        self.assertEqual(audit["images_saved"], 4)
        self.assertEqual(audit["counts"]["formal"], 3)
        self.assertEqual(audit["continuations"][-1]["new_formal_images"], 2)

    def test_formal_continuation_exhaustion_and_network_failure(self):
        self.initial_collection()
        report = continue_formal([row(3, usage="Formal"), row(4, usage="Sports")], self.root, new_target=3)
        self.assertEqual(report["stop_reason"], "dataset_exhausted")
        self.assertEqual(report["shortage_new_formal"], 2)
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        def broken():
            yield row(5, usage="Formal")
            raise OSError("fixture disconnect")
        with self.assertRaises(OSError):
            continue_formal(broken(), self.root, new_target=2)
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()})

    def test_formal_append_rolls_back_failed_audit_publication(self):
        original_images = self.initial_collection()
        before_csv = (self.root / OUTPUTS[1]).read_bytes()
        before_audit = (self.root / OUTPUTS[2]).read_bytes()
        real_replace = os.replace
        def fail_audit(source, destination):
            if Path(source).name == OUTPUTS[2]:
                raise OSError("fixture audit write failure")
            return real_replace(source, destination)
        with patch("feature_extraction.training.phase3_hf_fashion.os.replace", side_effect=fail_audit):
            with self.assertRaises(OSError):
                continue_formal([row(8, usage="Formal")], self.root, new_target=1)
        self.assertEqual((self.root / OUTPUTS[1]).read_bytes(), before_csv)
        self.assertEqual((self.root / OUTPUTS[2]).read_bytes(), before_audit)
        self.assertEqual({p: p.read_bytes() for p in (self.root / OUTPUTS[0]).iterdir()}, original_images)
        self.assertFalse((self.root / ".hf_fashion_pending.json").exists())

    def test_formal_continuation_rejects_corruption_before_stream(self):
        original = self.initial_collection()
        next(iter(original)).write_bytes(b"corrupt")
        def forbidden():
            raise AssertionError("Stream should not be read")
            yield
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            continue_formal(forbidden(), self.root)

    def test_formal_continuation_with_only_duplicates_is_noop(self):
        self.initial_collection()
        before_csv = (self.root / OUTPUTS[1]).read_bytes()
        before_audit = (self.root / OUTPUTS[2]).read_bytes()
        result = continue_formal([row(1, usage="Formal")], self.root)
        self.assertEqual(result["new_formal_images"], 0)
        self.assertEqual((self.root / OUTPUTS[1]).read_bytes(), before_csv)
        self.assertEqual((self.root / OUTPUTS[2]).read_bytes(), before_audit)


if __name__ == "__main__":
    unittest.main()
