"""Synthetic manifest/structure tests only: no optimizer steps or downloads."""

import csv
import math
from pathlib import Path
import tempfile
import unittest

import torch
from PIL import Image

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES, ARCHITECTURE, FORMAT_VERSION
from feature_extraction.model import ClothingModel
from feature_extraction.inference_service import ImageInferenceService
from feature_extraction.training.dataset import ClothingDataset, REQUIRED_COLUMNS, TrainingTransform
from feature_extraction.training.engine import build_checkpoint, save_checkpoint, configure_stage, run_epoch

TEST_ROOT = Path(__file__).resolve().parents[1]


class DatasetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=TEST_ROOT, prefix=".training-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = self.root / "manifest.csv"
        self.rows = []
        for index, split in enumerate(("train", "val", "test")):
            name = f"image_{index}.png"
            Image.new("RGB", (300, 280), (20, 50, 90)).save(self.root / name)
            self.rows.append({"image_path": name, "split": split,
                              **{head: CLASS_NAMES[head][-1] for head in HEAD_NAMES}})
        self.write()

    def write(self, columns=REQUIRED_COLUMNS):
        with self.manifest.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(self.rows)

    def test_split_filtering_encoding_and_output(self):
        for index, split in enumerate(("train", "val", "test")):
            dataset = ClothingDataset(self.manifest, split)
            self.assertEqual(len(dataset), 1)
            self.assertEqual(dataset.records[0][0].name, f"image_{index}.png")
            image, targets, masks = dataset[0]
            self.assertEqual(tuple(image.shape), (3, 224, 224))
            self.assertEqual(image.dtype, torch.float32)
            self.assertEqual(set(targets), set(HEAD_NAMES))
            for head in HEAD_NAMES:
                self.assertTrue(masks[head].item())
                if head == "color":
                    self.assertEqual(targets[head].dtype, torch.float32)
                    self.assertEqual(tuple(targets[head].shape), (len(CLASS_NAMES[head]),))
                    self.assertEqual(targets[head][-1].item(), 1.)
                    self.assertEqual(targets[head].sum().item(), 1.)
                    continue
                self.assertEqual(targets[head].dtype, torch.long)
                self.assertEqual(targets[head].ndim, 0)
                self.assertEqual(targets[head].item(), len(CLASS_NAMES[head]) - 1)
            if split == "train":
                self.assertIsInstance(dataset.transform, TrainingTransform)
            else:
                torch.testing.assert_close(dataset[0][0], dataset[0][0])

    def test_missing_manifest(self):
        with self.assertRaisesRegex(FileNotFoundError, "CSV manifest not found"):
            ClothingDataset(self.root / "absent.csv", "train")

    def test_missing_columns(self):
        self.write(tuple(c for c in REQUIRED_COLUMNS if c != "pattern"))
        with self.assertRaisesRegex(ValueError, "pattern"):
            ClothingDataset(self.manifest, "train")

    def test_unknown_labels_in_every_head_including_other_splits(self):
        for head in HEAD_NAMES:
            original = self.rows[2][head]
            self.rows[2][head] = "unknown_label"
            self.write()
            with self.assertRaisesRegex(ValueError, f"unknown {head}"):
                ClothingDataset(self.manifest, "train")
            self.rows[2][head] = original

    def test_missing_image(self):
        (self.root / "image_1.png").unlink()
        with self.assertRaisesRegex(FileNotFoundError, "image file not found"):
            ClothingDataset(self.manifest, "train")

    def test_invalid_or_empty_split(self):
        with self.assertRaisesRegex(ValueError, "Invalid requested split"):
            ClothingDataset(self.manifest, "validation")
        self.rows[0]["split"] = "invalid"
        self.write()
        with self.assertRaisesRegex(ValueError, "invalid split"):
            ClothingDataset(self.manifest, "val")
        self.rows = self.rows[1:]
        self.write()
        with self.assertRaisesRegex(ValueError, "no images"):
            ClothingDataset(self.manifest, "train")

    def test_duplicate_image_across_splits(self):
        self.rows[1]["image_path"] = self.rows[0]["image_path"]
        self.write()
        with self.assertRaisesRegex(ValueError, "duplicate image path"):
            ClothingDataset(self.manifest, "train")

    def test_corrupt_image_reports_path(self):
        (self.root / "image_0.png").write_bytes(b"invalid image")
        dataset = ClothingDataset(self.manifest, "train")
        with self.assertRaisesRegex(ValueError, "image_0.png"):
            dataset[0]


class TrainingStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = ClothingModel(backbone_weights=None)

    def test_transfer_stages_require_grad(self):
        configure_stage(self.model)
        self.assertTrue(all(not p.requires_grad for p in self.model.backbone.parameters()))
        self.assertTrue(all(p.requires_grad for p in self.model.heads.parameters()))
        configure_stage(self.model, 2)
        for block in list(self.model.backbone.children())[:-2]:
            self.assertTrue(all(not p.requires_grad for p in block.parameters()))
        for block in list(self.model.backbone.children())[-2:]:
            self.assertTrue(all(p.requires_grad for p in block.parameters()))

    def test_checkpoint_structure_serialization_and_inference_contract(self):
        # Synthetic metrics/state exercise serialization only, never a real run.
        validation = {"total_loss": 6.0, "heads": {
            head: {"loss": 1.0, "accuracy": 0.5} for head in HEAD_NAMES}}
        checkpoint = build_checkpoint(self.model, 1, validation, "heads", {"seed": 42})
        self.assertEqual(set(checkpoint), {"format_version", "architecture", "trained",
                                          "class_names", "state_dict", "training_metadata", "head_tasks"})
        self.assertEqual(checkpoint["format_version"], FORMAT_VERSION)
        self.assertEqual(checkpoint["architecture"], ARCHITECTURE)
        self.assertIs(checkpoint["trained"], True)
        self.assertEqual(checkpoint["class_names"], CLASS_NAMES)
        self.assertEqual(checkpoint["training_metadata"]["epochs"], 1)
        self.assertEqual(checkpoint["training_metadata"]["best_validation_loss"], 6.0)
        self.assertEqual(set(checkpoint["training_metadata"]["per_head_validation_accuracy"]), set(HEAD_NAMES))
        with tempfile.TemporaryDirectory(dir=TEST_ROOT, prefix=".training-test-") as directory:
            path = Path(directory) / "fixture.pt"
            save_checkpoint(checkpoint, path)
            loaded = torch.load(path, weights_only=True, map_location="cpu")
            self.assertEqual(loaded["class_names"], CLASS_NAMES)
            service = ImageInferenceService(str(path))
            self.assertTrue(service.load_checkpoint())
            self.assertTrue(service.is_ready)
            # Do not call predict() on these untrained structural fixture weights.
        with self.assertRaises(ValueError):
            build_checkpoint(self.model, 0, validation, "heads", {})

    def test_evaluation_metrics_without_training(self):
        class ConstantLogits(torch.nn.Module):
            def forward(self, images):
                return {head: torch.zeros(len(images), len(CLASS_NAMES[head])) for head in HEAD_NAMES}
        # Unequal batch sizes exercise sample-weighted accuracy; no optimizer exists.
        batches = [(torch.zeros(size, 3, 224, 224), {
            head: (torch.full((size, len(CLASS_NAMES[head])), float(target)) if head == "color"
                   else torch.full((size,), target, dtype=torch.long)) for head in HEAD_NAMES
        }) for size, target in ((2, 0), (1, 1))]
        metrics = run_epoch(ConstantLogits(), batches, torch.device("cpu"))
        self.assertEqual(metrics["samples"], 3)
        for head in HEAD_NAMES:
            if head == "color":
                self.assertAlmostEqual(metrics["heads"][head]["accuracy"], 1 / 3)
                self.assertAlmostEqual(metrics["heads"][head]["loss"], math.log(2), places=5)
                continue
            self.assertAlmostEqual(metrics["heads"][head]["accuracy"], 2 / 3)
            self.assertAlmostEqual(metrics["heads"][head]["loss"], math.log(len(CLASS_NAMES[head])), places=5)
        self.assertAlmostEqual(metrics["total_loss"], math.log(2) + sum(math.log(len(v)) for h, v in CLASS_NAMES.items() if h != "color"), places=5)


if __name__ == "__main__":
    unittest.main()
