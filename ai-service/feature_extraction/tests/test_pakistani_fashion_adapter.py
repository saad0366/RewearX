"""Local source, manifest, audit and strict preview-limit tests."""

import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from feature_extraction.training.adapters.pakistani_fashion import generate_manifest, inspect_source


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "dataset"
        self.source.mkdir()
        (self.source / "a.jpg").write_bytes(b"existence-only fixture")

    def csv(self, rows, columns=("image", "caption")):
        path = self.source / "captions.csv"
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(columns)
            writer.writerows(rows)
        return path

    def read(self, name="phase2_manifest.csv"):
        with (self.root / "output" / name).open(encoding="utf-8", newline="") as stream:
            return list(csv.DictReader(stream))

    def test_preview_audit_original_caption_and_source_unchanged(self):
        caption = 'Black, white and gold embroidered half-sleeved kurti\n"Beautiful"'
        path = self.csv([("a.jpg", caption), ("a.jpg", "gold earrings"), ("absent.jpg", "red shirt")])
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        audit = generate_manifest(path, self.root / "output", limit=2)
        self.assertEqual(audit["processed_rows"], 2)
        self.assertIsNone(audit["total_dataset_rows"])
        self.assertEqual(audit["half_sleeve_count"], 1)
        self.assertEqual(audit["embroidered_count"], 1)
        self.assertEqual(audit["other_fashion_count"], 1)
        self.assertEqual(audit["per_class_counts"]["color"]["gold"], 2)
        row = self.read()[0]
        self.assertEqual(row["original_caption"], caption)
        self.assertEqual(json.loads(row["parsed_colors"]), ["black", "white", "gold"])
        self.assertEqual(row["color"], "black|white|gold")
        self.assertEqual(row["occasion_valid"], "0")
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
        self.assertEqual(audit["missing_images"], [])  # Third row was not processed.

    def test_review_conflicts_missing_images_and_zero_labels_not_discarded(self):
        path = self.csv([("a.jpg", "red shirt and trousers"), ("a.jpg", "green half sleeve kurta"),
                         ("missing.jpg", "blue shirt"), ("a.jpg", "beautiful item"), ("a.jpg", "shirt")])
        audit = generate_manifest(path, self.root / "output", limit=100)
        self.assertEqual(audit["total_dataset_rows"], 5)
        self.assertEqual(len(self.read()), 5)
        self.assertEqual(len(self.read("phase2_review.csv")), 4)
        self.assertEqual(audit["valid_head_distribution"], {"zero": 2, "one": 2, "two": 1, "three_or_more": 0})
        self.assertEqual(audit["missing_images"], ["missing.jpg"])

    def test_jsonl_malformed_rows_preserved_and_limit_stops_before_bad_row(self):
        path = self.source / "captions.jsonl"
        path.write_text(json.dumps({"image": "a.jpg", "caption": "red shirt"}) + "\nnot json\n[]\n")
        audit = generate_manifest(path, self.root / "output", limit=1)
        self.assertEqual(audit["processing_error_rows"], 0)
        audit = generate_manifest(path, self.root / "other", limit=100)
        self.assertEqual(audit["processed_rows"], 3)
        self.assertEqual(audit["processing_error_rows"], 2)

    def test_explicit_column_mapping_and_image_root(self):
        path = self.csv([("a.jpg", "black leather handbag")], ("file", "sentence"))
        audit = generate_manifest(path, self.root / "output", image_column="file", caption_column="sentence", image_root=self.source)
        self.assertEqual(audit["other_fashion_count"], 1)

    def test_ambiguous_columns_go_to_review(self):
        path = self.csv([("a.jpg", "shirt", "dress")], ("image", "caption", "description"))
        audit = generate_manifest(path, self.root / "output")
        self.assertEqual(audit["processing_error_rows"], 1)
        self.assertIn("ambiguous_or_missing_caption", self.read()[0]["review_reason"])

    def test_output_never_overwrites_source_or_review(self):
        path = self.csv([("a.jpg", "shirt")])
        with self.assertRaises(ValueError):
            generate_manifest(path, self.source / "derived")
        generate_manifest(path, self.root / "output")
        with self.assertRaises(FileExistsError):
            generate_manifest(path, self.root / "output")
        with self.assertRaises(ValueError):
            generate_manifest(path, self.root / "other", limit=0)

    def test_ambiguous_layout_fails_clearly(self):
        self.csv([])
        (self.source / "other.jsonl").write_text("")
        with self.assertRaisesRegex(ValueError, "Ambiguous dataset layout"):
            inspect_source(self.source)

    @unittest.skipUnless(importlib.util.find_spec("pyarrow"), "Optional pyarrow is not installed")
    def test_parquet_embedded_image_and_metadata(self):
        import pyarrow as pa
        import pyarrow.parquet as pq
        table = pa.Table.from_pylist([{"image": {"bytes": b"fixture", "path": "a.png"}, "text": "gold earrings"},
                                     {"image": {"bytes": b"second", "path": "b.png"}, "text": "shirt"}])
        path = self.source / "data.parquet"
        pq.write_table(table, path)
        audit = generate_manifest(path, self.root / "output", limit=1)
        self.assertEqual(audit["total_dataset_rows"], 2)
        self.assertEqual(audit["processed_rows"], 1)
        self.assertEqual(Path(self.read()[0]["image_path"]).read_bytes(), b"fixture")
        self.assertEqual(len(list((self.root / "output" / "images").iterdir())), 1)

    @unittest.skipUnless(importlib.util.find_spec("pyarrow"), "Optional pyarrow is not installed")
    def test_arrow_stream_and_file(self):
        import pyarrow as pa
        table = pa.Table.from_pylist([{"image": "a.jpg", "caption": "black shirt"}])
        for kind in ("stream", "file"):
            path = self.source / f"{kind}.arrow"
            with pa.OSFile(str(path), "wb") as sink:
                factory = pa.ipc.new_stream if kind == "stream" else pa.ipc.new_file
                with factory(sink, table.schema) as writer:
                    writer.write_table(table)
            audit = generate_manifest(path, self.root / kind, limit=1)
            self.assertEqual(audit["per_head_valid_counts"]["category"], 1)


if __name__ == "__main__":
    unittest.main()
