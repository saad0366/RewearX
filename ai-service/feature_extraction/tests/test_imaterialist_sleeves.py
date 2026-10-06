"""Offline sleeve collector fixtures; no network or training."""

import csv
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

from feature_extraction.training.phase3_imaterialist_sleeves import (
    CLASSES, OTHER_HEADS, OUTPUTS, collect, main, map_sleeve,
)


def row(index, sleeve="Long Sleeved", with_id=True):
    stream = BytesIO()
    Image.new("RGB", (8, 8), (index % 256, index // 256, 100)).save(stream, format="PNG")
    result = {"image": {"bytes": stream.getvalue()}, "sleeve": sleeve,
              "color": "Black", "category": "Shirt", "pattern": "Striped"}
    if with_id:
        result["item_ID"] = index
    return result


class MappingTests(unittest.TestCase):
    def test_safe_mapping(self):
        for original, expected in (("Long Sleeved", "full"), ("Short Sleeves", "short"), ("Sleeveless", "sleeveless")):
            self.assertEqual(map_sleeve(original), expected)

    def test_ignored_values_are_missing(self):
        for value in ("Puff Sleeves", "Strapless", None, "", "Half", "Three Quarter", "long sleeved", ["Sleeveless"]):
            self.assertIsNone(map_sleeve(value))


class CollectorTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def manifest(self, root):
        with (root / OUTPUTS[1]).open(newline="", encoding="utf-8") as stream:
            return list(csv.DictReader(stream))

    def test_deterministic_selection_exact_quotas_and_masks(self):
        data = [row(i, ("Sleeveless", "Short Sleeves", "Long Sleeved")[i % 3]) for i in range(60)]
        a = collect(data, self.root / "a", target=3, seed=42)
        b = collect(data, self.root / "b", target=3, seed=42)
        collect(data, self.root / "c", target=3, seed=43)
        self.assertEqual(a, b)
        self.assertEqual(self.manifest(self.root / "a"), self.manifest(self.root / "b"))
        self.assertNotEqual(self.manifest(self.root / "a"), self.manifest(self.root / "c"))
        self.assertEqual(a["counts"], {label: 3 for label in CLASSES})
        self.assertEqual(a["images_saved"], 9)
        self.assertEqual(a["stop_reason"], "targets_met")
        for item in self.manifest(self.root / "a"):
            self.assertEqual(item["sleeve_length_valid"], "1")
            self.assertEqual(item["needs_manual_review"], "1")
            self.assertEqual(item["sleeve_length"], map_sleeve(item["source_sleeve"]))
            for head in OTHER_HEADS:
                self.assertEqual(item[head], "")
                self.assertEqual(item[head + "_valid"], "0")

    def test_id_and_hash_deduplication(self):
        a = row(1)
        same_id = {**row(2), "item_ID": 1}
        missing_id = row(3, with_id=False)
        same_bytes = {**a, "item_ID": 4}
        report = collect([a, same_id, missing_id, dict(missing_id), same_bytes], self.root, target=10, batch_size=1)
        self.assertEqual(report["images_saved"], 2)
        self.assertEqual(report["duplicates_skipped"], 3)
        self.assertTrue(self.manifest(self.root)[1]["source_id"].startswith("sha256:"))

    def test_ignored_rows_and_original_indices(self):
        data = [row(0, None), row(1, "Puff Sleeves"), row(2, "Strapless"), row(3, "Short Sleeves")]
        report = collect(data, self.root, target=2)
        self.assertEqual(report["images_saved"], 1)
        self.assertEqual(report["shortages"], {"sleeveless": 2, "short": 1, "full": 2})
        self.assertEqual(self.manifest(self.root)[0]["source_row_index"], "3")
        self.assertEqual(report["stop_reason"], "dataset_exhausted")

    def test_no_overwrite_before_consumption(self):
        collect([row(1)], self.root)
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        def forbidden():
            raise AssertionError("Must not iterate")
            yield
        with self.assertRaises(FileExistsError):
            collect(forbidden(), self.root)
        # CLI also checks before importing datasets or requesting remote metadata.
        with self.assertRaises(FileExistsError):
            main(["--output-root", str(self.root)])
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()})

    def test_overwrite_backs_up_only_owned_outputs(self):
        collect([row(1)], self.root)
        original = (self.root / OUTPUTS[1]).read_bytes()
        other = self.root / "hf_fashion_manifest.csv"
        other.write_text("leave untouched")
        report = collect([row(2)], self.root, overwrite=True)
        self.assertEqual((Path(report["previous_outputs_backup"]) / OUTPUTS[1]).read_bytes(), original)
        self.assertEqual(other.read_text(), "leave untouched")

    def test_scan_and_byte_limits(self):
        data = [row(i) for i in range(10)]
        result = collect(data, self.root / "rows", max_rows=2)
        self.assertEqual(result["rows_scanned"], 2)
        self.assertEqual(result["stop_reason"], "max_rows")
        result = collect(data, self.root / "bytes", max_stream_bytes=1)
        self.assertEqual(result["rows_scanned"], 1)
        self.assertEqual(result["stop_reason"], "stream_image_byte_limit")

    def test_bad_image_is_audited_and_stream_error_does_not_publish(self):
        bad = row(1)
        bad["image"]["bytes"] = b"broken"
        report = collect([bad, row(2)], self.root / "bad")
        self.assertEqual(len(report["invalid_images"]), 1)
        self.assertEqual(report["images_saved"], 1)
        def broken_stream():
            yield row(3)
            raise OSError("fixture network error")
        with self.assertRaises(OSError):
            collect(broken_stream(), self.root / "network")
        self.assertFalse(any((self.root / "network" / name).exists() for name in OUTPUTS))

    def test_failed_overwrite_publication_restores_previous_outputs(self):
        collect([row(1)], self.root)
        before = {p: p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        original_rename = Path.rename
        def fail_manifest(path, destination):
            if path.name == OUTPUTS[1] and path.parent.name.startswith(".imaterialist_stage_"):
                raise OSError("fixture publication error")
            return original_rename(path, destination)
        with patch.object(Path, "rename", fail_manifest), self.assertRaises(OSError):
            collect([row(2)], self.root, overwrite=True)
        for path, content in before.items():
            self.assertEqual(path.read_bytes(), content)
        self.assertEqual(len(list((self.root / OUTPUTS[0]).iterdir())), 1)
        self.assertFalse((self.root / ".imaterialist_sleeves.lock").exists())


if __name__ == "__main__":
    unittest.main()
