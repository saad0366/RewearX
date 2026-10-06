"""Offline v2 color and v1 warm-start regression tests; no training downloads."""

from pathlib import Path
import tempfile
import unittest

import torch
from PIL import Image

from feature_extraction.clothing_config import (
    CLASS_NAMES, HEAD_NAMES, HEAD_TASKS, ARCHITECTURE, FORMAT_VERSION,
)
from feature_extraction.inference_service import decode_colors
from feature_extraction.model import ClothingModel
from feature_extraction.training.checkpoints import load_training_checkpoint
from feature_extraction.training.dataset import PartialLabelDataset, ClothingDataset
from feature_extraction.training.engine import run_epoch


class ColorTests(unittest.TestCase):
    def test_atomic_taxonomy_and_preserved_heads(self):
        self.assertIn("gold", CLASS_NAMES["color"])
        self.assertNotIn("multicolor", CLASS_NAMES["color"])
        self.assertEqual(CLASS_NAMES["category"][-1], "other_fashion")
        self.assertEqual(CLASS_NAMES["sleeve_length"], ("sleeveless", "short", "half", "three_quarter", "full"))
        self.assertEqual(CLASS_NAMES["pattern"], ("plain", "striped", "checked", "floral", "printed", "embroidered"))

    def test_zero_one_two_three_colors(self):
        for names, expected in (([], None), (["gold"], "gold"),
                                (["black", "gold"], ["black", "gold"]),
                                (["black", "blue", "gold"], "multicolor")):
            logits = torch.full((len(CLASS_NAMES["color"]),), -3.)
            for name in names:
                logits[CLASS_NAMES["color"].index(name)] = 3.
            decoded = decode_colors(logits)
            self.assertEqual(decoded["label"], expected)
            self.assertEqual(decoded["labels"], names)
            for name in names:
                self.assertAlmostEqual(decoded["probabilities"][name], torch.sigmoid(torch.tensor(3.)).item())

    def test_threshold_and_invalid_logits(self):
        self.assertEqual(decode_colors(torch.zeros(12))["label"], "multicolor")
        self.assertIsNone(decode_colors(torch.zeros(12), threshold=0.6)["label"])
        with self.assertRaises(ValueError):
            decode_colors(torch.zeros(12), threshold=1.)
        with self.assertRaises(ValueError):
            decode_colors(torch.full((12,), float("nan")))

    def test_multihot_csv_adapter_and_missing_masks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            Image.new("RGB", (32, 32)).save(root / "test.png")
            dataset = PartialLabelDataset([(root / "test.png", {"color": ["black", "gold"]}),
                                          (root / "test.png", {})], "val")
            _, target, mask = dataset[0]
            self.assertEqual(target["color"].sum().item(), 2.)
            self.assertEqual(target["color"][[0, 11]].tolist(), [1., 1.])
            self.assertTrue(mask["color"].item())
            self.assertFalse(dataset[1][2]["color"].item())
            self.assertEqual(dataset[1][1]["color"].sum().item(), 0.)
            manifest = root / "data.csv"
            manifest.write_text("image_path," + ",".join(HEAD_NAMES) + ",split\ntest.png,black|gold,,,,,,val\n")
            torch.testing.assert_close(ClothingDataset(manifest, "val")[0][1]["color"], target["color"])
            for invalid in ("multicolor", "black_gold", ["black", "black"]):
                with self.assertRaises(ValueError):
                    PartialLabelDataset([(root / "test.png", {"color": invalid})], "val")

    def test_bce_and_cross_entropy_masks_gradients(self):
        class Fixture(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.backbone = torch.nn.Sequential()
                self.color = torch.nn.Parameter(torch.full((2, 12), 0.2))
                self.sleeve = torch.nn.Parameter(torch.zeros(2, 5))

            def forward(self, images):
                return {"color": self.color, "sleeve_length": self.sleeve}

        model = Fixture()
        targets = {h: torch.full((2,), -100) for h in HEAD_NAMES}
        masks = {h: torch.zeros(2, dtype=torch.bool) for h in HEAD_NAMES}
        targets["color"] = torch.zeros(2, 12)
        targets["color"][0, [0, 11]] = 1.
        targets["color"][1] = float("nan")  # Masked rows must never enter BCE.
        masks["color"][0] = True
        targets["sleeve_length"][1] = 2
        masks["sleeve_length"][1] = True
        expected_color = torch.nn.functional.binary_cross_entropy_with_logits(model.color[0], targets["color"][0]).item()
        expected_sleeve = torch.nn.functional.cross_entropy(model.sleeve[1:2], torch.tensor([2])).item()
        optimizer = torch.optim.SGD(model.parameters(), lr=0.)
        metrics = run_epoch(model, [(torch.zeros(2, 1), targets, masks)], torch.device("cpu"),
                            optimizer, active_heads=("color", "sleeve_length"))
        self.assertAlmostEqual(metrics["total_loss"], expected_color + expected_sleeve)
        self.assertEqual(model.color.grad[1].abs().sum().item(), 0.)
        self.assertEqual(model.sleeve.grad[0].abs().sum().item(), 0.)
        self.assertLess(model.color.grad[0, 0].item(), 0.)
        self.assertGreater(model.color.grad[0, 1].item(), 0.)


class WarmStartTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_labels = dict(CLASS_NAMES)
        cls.old_labels["color"] = (*CLASS_NAMES["color"][:-1], "multicolor")
        cls.old_labels["category"] = CLASS_NAMES["category"][:-1]
        cls.old_model = ClothingModel(cls.old_labels, backbone_weights=None)

    def fixture(self):
        return {"format_version": 1, "architecture": "efficientnet_b0_six_head_v1", "trained": False,
                "class_names": dict(self.old_labels), "state_dict": dict(self.old_model.state_dict())}

    def load(self, model, payload):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "phase1.pt"
            torch.save(payload, path)
            original = path.read_bytes()
            report = load_training_checkpoint(model, path)
            self.assertEqual(path.read_bytes(), original)
            return report

    def test_legacy_preserves_all_compatible_tensors_exactly(self):
        model = ClothingModel(backbone_weights=None)
        fresh = {k: v.clone() for k, v in model.state_dict().items() if k.startswith(("heads.color.", "heads.category."))}
        report = self.load(model, self.fixture())
        self.assertEqual(set(report["reset_heads"]), {"color", "category"})
        self.assertEqual(len(report["skipped_keys"]), 4)
        for key, value in model.state_dict().items():
            expected = fresh[key] if key in fresh else self.old_model.state_dict()[key]
            self.assertTrue(torch.equal(value, expected), key)
        # Color is reset despite identical shape: softmax multicolor != sigmoid gold.
        self.assertEqual(model.heads.color.weight.shape, self.old_model.heads.color.weight.shape)

    def test_current_checkpoint_loads_every_tensor(self):
        source = ClothingModel(backbone_weights=None)
        payload = {"format_version": FORMAT_VERSION, "architecture": ARCHITECTURE,
                   "head_tasks": dict(HEAD_TASKS), "trained": False,
                   "class_names": dict(CLASS_NAMES), "state_dict": source.state_dict()}
        target = ClothingModel(backbone_weights=None)
        report = self.load(target, payload)
        self.assertFalse(report["skipped_keys"])
        for key, value in target.state_dict().items():
            self.assertTrue(torch.equal(value, source.state_dict()[key]), key)

    def test_protected_taxonomy_mismatch_fails_before_mutation(self):
        for head in ("sleeve_length", "pattern", "occasion", "season"):
            payload = self.fixture()
            payload["class_names"][head] = tuple(reversed(payload["class_names"][head]))
            target = ClothingModel(backbone_weights=None)
            before = target.heads.sleeve_length.weight.detach().clone()
            with self.assertRaisesRegex(ValueError, "protected head"):
                self.load(target, payload)
            self.assertTrue(torch.equal(before, target.heads.sleeve_length.weight))

    def test_corrupt_or_incomplete_checkpoints_rejected(self):
        for problem in ("missing", "extra", "backbone_shape", "color_shape", "nan", "architecture"):
            payload = self.fixture()
            if problem == "missing":
                del payload["state_dict"]["heads.pattern.bias"]
            elif problem == "extra":
                payload["state_dict"]["unexpected"] = torch.zeros(1)
            elif problem == "backbone_shape":
                payload["state_dict"]["backbone.0.0.weight"] = torch.zeros(1)
            elif problem == "color_shape":
                payload["state_dict"]["heads.color.weight"] = torch.zeros(1)
            elif problem == "nan":
                payload["state_dict"]["heads.pattern.bias"] = torch.full((6,), float("nan"))
            else:
                payload["architecture"] = "unrecognized"
            with self.subTest(problem=problem), self.assertRaises(ValueError):
                self.load(ClothingModel(backbone_weights=None), payload)


if __name__ == "__main__":
    unittest.main()
