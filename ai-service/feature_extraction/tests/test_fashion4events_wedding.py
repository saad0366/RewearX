"""Local synthetic wedding fixtures only; no training or remote images."""

import csv
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from feature_extraction.training.phase3_fashion4events_wedding import (
    LocalImages, OTHER_HEADS, OUTPUTS, collect, map_event, photo_group, read_labels,
)


class WeddingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.images = self.base / "valid"
        (self.images / "0").mkdir(parents=True)
        self.labels = self.base / "valid.txt"
        self.output = self.base / "output"
        self.rows = []
        for group in range(8):
            for view in range(1, 4):
                name = f"photo{group}-{view}.jpg"
                Image.new("RGB", (10, 10), (group * 20, view * 50, 80)).save(self.images / "0" / name, format="PNG")
                self.rows.append([f"/machine/dataset/valid/0/{name}", "7", "11"])
        self.write()

    def write(self):
        with self.labels.open("w", newline="", encoding="utf-8") as stream:
            csv.writer(stream).writerows(self.rows)

    def manifest(self, root=None):
        with ((root or self.output) / OUTPUTS[1]).open(newline="", encoding="utf-8") as stream:
            return list(csv.DictReader(stream))

    def test_event_parsing_and_exact_mapping(self):
        self.rows.append(["/machine/valid/0/nonwedding.jpg", "0", "11"])
        self.write()
        rows = list(read_labels(self.labels))
        self.assertEqual(rows[0]["source_event_class"], 7)
        self.assertEqual(rows[-1]["source_row_index"], 24)
        self.assertEqual(map_event(7), "wedding")
        for value in (0, 1, 11, "7", None, True):
            self.assertIsNone(map_event(value))
        report = collect(self.labels, self.images, self.output, target=5)
        self.assertEqual(report["total_label_rows"], 25)
        self.assertEqual(report["wedding_label_rows"], 24)
        self.assertEqual(report["missing_local_image_count"], 0)

    def test_invalid_label_rows_fail(self):
        for content in ("path,field\n", "path,field,seven\n", ",0,7\n", "path,14,7\n", "path,7,13\n", "path,-1,0\n"):
            self.labels.write_text(content)
            with self.assertRaises(ValueError):
                list(read_labels(self.labels))

    def test_event_column_not_garment_or_folder(self):
        self.rows=[["/machine/valid/7/not_wedding.jpg", "0", "7"],
                   ["/machine/valid/0/wedding.jpg", "7", "11"]]
        self.write();rows=list(read_labels(self.labels))
        self.assertIsNone(map_event(rows[0]['source_event_class']))
        self.assertEqual(map_event(rows[1]['source_event_class']),'wedding')
        self.assertEqual(rows[1]['source_garment_class'],11)

    def test_safe_path_resolution_and_ambiguous_fallback(self):
        index = LocalImages(self.images)
        expected = (self.images / "0/photo0-1.jpg").resolve()
        for original in ("/absolute/valid/0/photo0-1.jpg", "C:\\old\\valid\\0\\photo0-1.jpg",
                         "/other/layout/photo0-1.jpg", "0/photo0-1.jpg"):
            self.assertEqual(index.resolve(original), expected)
        self.assertIsNone(index.resolve("/machine/valid/0/missing.jpg"))
        with self.assertRaises(ValueError):
            index.resolve("/machine/valid/../../outside.jpg")
        (self.images / "1").mkdir()
        (self.images / "1/photo0-1.jpg").write_bytes(expected.read_bytes())
        index = LocalImages(self.images)
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            index.resolve("/unrelated/photo0-1.jpg")
        self.assertEqual(index.resolve("/absolute/valid/0/photo0-1.jpg"), expected)

    def test_photo_group_suffix_only(self):
        self.assertEqual(photo_group("123_abc-12.jpg"), "123_abc")
        self.assertEqual(photo_group("name-with-hyphens-2.jpg"), "name-with-hyphens")
        self.assertEqual(photo_group("photo-final.jpg"), "photo-final")

    def test_deterministic_selection_prefers_unique_groups_and_masks(self):
        a = collect(self.labels, self.images, self.output, target=5, seed=42)
        collect(self.labels, self.images, self.base / "again", target=5, seed=42)
        collect(self.labels, self.images, self.base / "other_seed", target=5, seed=43)
        first = self.manifest()
        self.assertEqual(first, self.manifest(self.base / "again"))
        self.assertNotEqual(first, self.manifest(self.base / "other_seed"))
        self.assertEqual(a["images_saved"], 5)
        self.assertEqual(a["selected_photo_groups"], 5)
        self.assertEqual(a["selected_additional_views"], 0)
        self.assertEqual(a["additional_views_skipped"], 10)
        for row in first:
            self.assertEqual(row["occasion"], "wedding")
            self.assertEqual(row["occasion_valid"], "1")
            self.assertEqual(row["needs_manual_review"], "1")
            for head in OTHER_HEADS:
                self.assertEqual(row[head], "")
                self.assertEqual(row[head + "_valid"], "0")

    def test_additional_views_only_after_all_groups(self):
        self.rows = self.rows[:6]
        self.write()
        report = collect(self.labels, self.images, self.output, target=5)
        self.assertEqual(report["selected_photo_groups"], 2)
        self.assertEqual(report["selected_additional_views"], 3)
        self.assertEqual(report["shortage"], 0)

    def test_byte_deduplication_missing_files_and_source_unchanged(self):
        (self.images / "0/copy-1.jpg").write_bytes((self.images / "0/photo0-1.jpg").read_bytes())
        self.rows.extend([["/original/valid/0/copy-1.jpg", "7", "0"], self.rows[0],
                          ["/original/valid/0/missing.jpg", "7", "0"]])
        self.write()
        before = {p: p.read_bytes() for p in self.images.rglob("*") if p.is_file()}
        label_bytes = self.labels.read_bytes()
        report = collect(self.labels, self.images, self.output, target=100)
        self.assertEqual(report["images_saved"], 24)
        self.assertEqual(report["duplicate_image_bytes_in_wedding_pool"], 1)
        self.assertEqual(report["duplicate_annotation_rows"], 1)
        self.assertEqual(report["selection_duplicate_skips"], 1)
        self.assertEqual(report["missing_local_image_count"], 1)
        self.assertEqual(report["shortage"], 76)
        self.assertEqual(len({r["image_sha256"] for r in self.manifest()}), 24)
        self.assertEqual(before, {p: p.read_bytes() for p in self.images.rglob("*") if p.is_file()})
        self.assertEqual(self.labels.read_bytes(), label_bytes)

    def test_no_overwrite_and_explicit_backup(self):
        collect(self.labels, self.images, self.output, target=3)
        original = (self.output / OUTPUTS[1]).read_bytes()
        unrelated = self.output / "labels.csv"
        unrelated.write_text("keep")
        with self.assertRaises(FileExistsError):
            collect(self.base / "nonexistent.txt", self.images, self.output)
        report = collect(self.labels, self.images, self.output, target=4, overwrite=True)
        self.assertEqual((Path(report["previous_outputs_backup"]) / OUTPUTS[1]).read_bytes(), original)
        self.assertEqual(unrelated.read_text(), "keep")

    def test_bad_image_and_outputs_inside_source_rejected(self):
        (self.images / "0/photo0-1.jpg").write_bytes(b"corrupt")
        report = collect(self.labels, self.images, self.output, target=5)
        self.assertEqual(report["invalid_image_count"], 1)
        with self.assertRaises(ValueError):
            collect(self.labels, self.images, self.images / "output")


if __name__ == "__main__":
    unittest.main()
