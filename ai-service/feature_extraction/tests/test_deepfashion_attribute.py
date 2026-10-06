"""Synthetic text/image-path fixtures only; no training, image copies, or torch."""

import json
from pathlib import Path
import tempfile
import unittest

from feature_extraction.training.adapters.deepfashion_attribute import (
    CATEGORY_MAP, DeepFashionAttributeAdapter, image_name, map_attribute, read_vocabulary,
)
from feature_extraction.training.phase3_deepfashion_audit import audit_dataset


class MappingTests(unittest.TestCase):
    def test_categories_are_explicit_and_conservative(self):
        for source, target in (("Hoodie", "hoodie"), ("Jacket", "jacket"), ("Sweater", "sweater"),
                               ("Tee", "t_shirt"), ("Jeans", "jeans"), ("Skirt", "skirt"),
                               ("Blouse", "shirt"), ("Button-Down", "shirt"), ("Chinos", "trousers"),
                               ("Sweatpants", "trousers"), ("Joggers", "trousers"),
                               ("Dress", "dress"), ("Shirtdress", "dress"), ("Sundress", "dress")):
            self.assertEqual(CATEGORY_MAP[source], target)
        for source in ("Top", "Cape", "Kaftan", "Kimono", "Leggings", "Jumpsuit", "Halter", "Turtleneck"):
            self.assertNotIn(source, CATEGORY_MAP)
        self.assertFalse(set(CATEGORY_MAP.values()) & {"shalwar_kameez", "lehenga", "other_fashion"})

    def test_only_explicit_sleeves(self):
        self.assertEqual(map_attribute("sleeveless")["sleeve_length"], "sleeveless")
        for name in ("long sleeve", "long-sleeve", "long-sleeved"):
            self.assertEqual(map_attribute(name)["sleeve_length"], "full")
        for name in ("cap-sleeve", "flutter-sleeve", "bell-sleeve", "dolman sleeve", "raglan sleeve", "cuffed-sleeve", "sleeve", "short", "half", "three-quarter"):
            self.assertIsNone(map_attribute(name)["sleeve_length"])

    def test_pattern_variants_and_compounds(self):
        groups = {"checked": ("checked", "checkered", "plaid", "plaid shirt"),
                  "striped": ("stripe", "striped", "stripes", "pinstripe", "pinstriped", "multi-stripe", "varsity-striped", "breton stripe"),
                  "floral": ("floral", "abstract floral", "floral print", "floral print skater"),
                  "printed": ("print", "printed", "animal print", "southwestern-print"),
                  "embroidered": ("embroidered", "embroidery", "embroidered woven"), "plain": ("solid",)}
        for target, names in groups.items():
            for name in names:
                self.assertEqual(map_attribute(name)["pattern"], [target], name)
        self.assertEqual(map_attribute("floral-embroidered")["pattern"], ["embroidered", "floral"])
        for name in ("solid gold", "blue", "abstract", "blueprint", "lace", "ribbed"):
            self.assertEqual(map_attribute(name)["pattern"], [])

    def test_unsafe_image_names(self):
        for name in ("../outside.jpg", "/img/a.jpg", "img/../../a.jpg", "C:/img/a.jpg", "img\\a.jpg"):
            with self.assertRaises(ValueError):
                image_name(name)


class ParsingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / "dataset"
        self.anno = self.root / "Anno_coarse"
        self.anno.mkdir(parents=True)
        (self.root / "Eval").mkdir()
        (self.root / "img").mkdir()
        self.write("list_category_cloth.txt", "category_name category_type", ["Hoodie 1", "Skirt 2", "Top 1"])
        self.write("list_attr_cloth.txt", "attribute_name attribute_type", ["long sleeve 4", "sleeveless 4", "floral print 1", "embroidered 2", "solid 5"])
        self.write("list_category_img.txt", "image_name category_label", ["img/a.jpg 1", "img/b.jpg 2", "img/c.jpg 3"])
        self.write("list_attr_img.txt", "image_name attribute_labels", ["img/a.jpg 1 -1 1 -1 0", "img/b.jpg -1 1 1 1 -1", "img/c.jpg 0 0 -1 -1 1"])
        self.partition = self.root / "Eval/list_eval_partition.txt"
        self.partition.write_text("3\nimage_name evaluation_status\nimg/c.jpg test\nimg/a.jpg train\nimg/b.jpg val\n")
        (self.root / "img/a.jpg").touch()
        (self.root / "img/c.jpg").touch()

    def write(self, name, header, rows):
        (self.anno / name).write_text(str(len(rows)) + "\n" + header + "\n" + "\n".join(rows) + "\n", encoding="utf-8")

    def test_multiword_vocabulary_one_based_categories_and_official_partition_join(self):
        vocab = read_vocabulary(self.anno / "list_attr_cloth.txt", "attribute")
        self.assertEqual(vocab[0], {"name": "long sleeve", "type": 4})
        rows = list(DeepFashionAttributeAdapter(self.root))
        self.assertEqual([row["split"] for row in rows], ["train", "val", "test"])
        self.assertEqual(rows[0]["labels"]["category"], "hoodie")
        self.assertEqual(rows[1]["labels"]["category"], "skirt")
        self.assertEqual(rows[0]["labels"]["sleeve_length"], "full")
        self.assertEqual(rows[0]["labels"]["pattern"], "floral")
        self.assertFalse(rows[1]["valid"]["pattern"])
        self.assertIn("conflicting_pattern", rows[1]["review_reasons"])
        self.assertTrue(rows[1]["valid"]["sleeve_length"])
        self.assertFalse(rows[2]["valid"]["category"])
        self.assertEqual(rows[2]["labels"]["pattern"], "plain")
        for row in rows:
            self.assertEqual(len(row["labels"]), 6)
            self.assertEqual(len(row["valid"]), 6)
            for head in ("color", "occasion", "season"):
                self.assertIsNone(row["labels"][head])
                self.assertFalse(row["valid"][head])

    def test_negative_unknown_never_become_plain_or_sleeve(self):
        self.write("list_attr_img.txt", "image_name attribute_labels", [f"img/{name}.jpg -1 0 -1 0 -1" for name in "abc"])
        for row in DeepFashionAttributeAdapter(self.root):
            self.assertFalse(row["valid"]["sleeve_length"])
            self.assertFalse(row["valid"]["pattern"])

    def test_sleeve_conflict_masked(self):
        self.write("list_attr_img.txt", "image_name attribute_labels", [f"img/{name}.jpg 1 1 -1 0 -1" for name in "abc"])
        for row in DeepFashionAttributeAdapter(self.root):
            self.assertFalse(row["valid"]["sleeve_length"])
            self.assertIn("conflicting_sleeve_length", row["review_reasons"])

    def test_missing_partition_remains_unassigned(self):
        self.partition.unlink()
        rows = list(DeepFashionAttributeAdapter(self.root))
        self.assertTrue(all(row["split"] == "unassigned" for row in rows))

    def test_invalid_vectors_duplicates_and_counts(self):
        for rows in (["img/a.jpg 1 0"], ["img/a.jpg 2 0 0 0 0"],
                     ["img/a.jpg 1 0 0 0 0"] * 3, ["img/a.jpg 1 0 0 0 0"]):
            self.write("list_attr_img.txt", "image_name attribute_labels", rows)
            with self.assertRaises(ValueError):
                list(DeepFashionAttributeAdapter(self.root))
        self.write("list_attr_img.txt", "image_name attribute_labels", [f"img/{name}.jpg 0 0 0 0 0" for name in "abc"])
        path = self.anno / "list_attr_img.txt"
        path.write_text(path.read_text().replace("3\n", "4\n", 1))
        with self.assertRaisesRegex(ValueError, "declared"):
            list(DeepFashionAttributeAdapter(self.root))

    def test_bad_category_id_and_partition(self):
        self.write("list_category_img.txt", "image_name category_label", ["img/a.jpg 0"])
        with self.assertRaisesRegex(ValueError, "category ID"):
            DeepFashionAttributeAdapter(self.root)
        self.write("list_category_img.txt", "image_name category_label", ["img/a.jpg 1"])
        with self.assertRaisesRegex(ValueError, "sets differ"):
            DeepFashionAttributeAdapter(self.root)
        self.partition.write_text("1\nimage_name evaluation_status\nimg/a.jpg training\n")
        with self.assertRaisesRegex(ValueError, "official split"):
            DeepFashionAttributeAdapter(self.root)

    def test_audit_separates_missing_from_useful_and_does_not_write_source(self):
        (self.root / "img/extra.jpg").touch()
        before = {str(p): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        output = self.base / "audit"
        report = audit_dataset(self.root, output)
        self.assertEqual(report["total_images_found"], 3)
        self.assertEqual(report["missing_images"], 1)
        self.assertEqual(report["unannotated_images_found"], 1)
        self.assertEqual(report["useful_images_found"], 2)
        self.assertEqual(report["class_counts"]["category"]["skirt"], 0)
        self.assertEqual(report["annotation_class_counts"]["category"]["skirt"], 1)
        self.assertEqual(report["conflicting_pattern_labels"], 1)
        self.assertEqual(report["split_counts"], {"train": 1, "val": 1, "test": 1, "unassigned": 0})
        self.assertEqual(report["split_counts_images_found"]["val"], 0)
        self.assertEqual(json.loads((output / "audit.json").read_text())["missing_images"], 1)
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.root.rglob("*") if p.is_file()})
        with self.assertRaises(FileExistsError):
            audit_dataset(self.root, output)
        with self.assertRaises(ValueError):
            audit_dataset(self.root, self.root / "audit")


if __name__ == "__main__":
    unittest.main()
