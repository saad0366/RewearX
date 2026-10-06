"""Phase 3 taxonomy migration: offline tensor loading only, no training."""

import hashlib
from pathlib import Path
import tempfile
import unittest

import torch

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_TASKS, ARCHITECTURE, FORMAT_VERSION
from feature_extraction.model import ClothingModel
from feature_extraction.training.checkpoints import load_training_checkpoint


class Phase3CheckpointTests(unittest.TestCase):
    def fixture(self):
        labels = dict(CLASS_NAMES)
        labels["category"] = (*CLASS_NAMES["category"][:8], "kurti", *CLASS_NAMES["category"][9:])
        source = ClothingModel(labels, backbone_weights=None)
        with torch.no_grad():
            # Distinguishable learned values, including a bias unlike fresh init.
            for i in range(12):
                source.heads.category.weight[i].fill_(10. + i)
                source.heads.category.bias[i].fill_(20. + i)
        return {"format_version": FORMAT_VERSION, "architecture": ARCHITECTURE,
                "head_tasks": dict(HEAD_TASKS), "trained": False,
                "class_names": labels, "state_dict": source.state_dict(),
                "training_metadata": {"phase": "phase2"}}

    def test_exact_taxonomy(self):
        self.assertEqual(CLASS_NAMES["category"], (
            "t_shirt", "shirt", "hoodie", "sweater", "jacket", "jeans", "trousers",
            "dress", "skirt", "shalwar_kameez", "lehenga", "other_fashion"))

    def test_phase2_preserves_every_tensor_except_fresh_skirt_weight_and_bias(self):
        payload = self.fixture()
        target = ClothingModel(backbone_weights=None)
        fresh = {k: v.clone() for k, v in target.state_dict().items() if k.startswith("heads.category.")}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "phase2_pakistani_best.pt"
            torch.save(payload, path)
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            report = load_training_checkpoint(target, path)
            self.assertEqual(before, hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(len(report["loaded_keys"]), 368)
        self.assertEqual(set(report["partially_loaded_keys"]), set(fresh))
        self.assertEqual(report["skipped_keys"], [])
        self.assertEqual(report["reset_heads"], {})
        for key, value in target.state_dict().items():
            source = payload["state_dict"][key]
            if key in fresh:
                self.assertTrue(torch.equal(value[8], fresh[key][8]), key)
                self.assertFalse(torch.equal(value[8], source[8]), key)
                rows = [i for i in range(12) if i != 8]
                self.assertTrue(torch.equal(value[rows], source[rows]), key)
                self.assertEqual(report["partially_loaded_keys"][key]["loaded_rows"], rows)
                self.assertEqual(report["partially_loaded_keys"][key]["fresh_rows"], [8])
            else:
                self.assertTrue(torch.equal(value, source), key)

    def test_migration_does_not_allow_other_reorderings(self):
        payload = self.fixture()
        categories = list(payload["class_names"]["category"])
        categories[0], categories[1] = categories[1], categories[0]
        payload["class_names"]["category"] = categories
        target = ClothingModel(backbone_weights=None)
        fresh = target.heads.category.weight.detach().clone()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.pt"
            torch.save(payload, path)
            report = load_training_checkpoint(target, path)
        self.assertFalse(report["partially_loaded_keys"])
        self.assertIn("category", report["reset_heads"])
        self.assertTrue(torch.equal(target.heads.category.weight, fresh))

    def test_corrupt_migration_fails_before_any_model_mutation(self):
        for failure in ("dtype", "shape", "protected_head"):
            payload = self.fixture()
            if failure == "dtype":
                payload["state_dict"]["heads.category.bias"] = payload["state_dict"]["heads.category.bias"].double()
            elif failure == "shape":
                payload["state_dict"]["heads.category.weight"] = torch.zeros(11, 1280)
            else:
                payload["class_names"]["pattern"] = tuple(reversed(CLASS_NAMES["pattern"]))
            target = ClothingModel(backbone_weights=None)
            before = {k: v.clone() for k, v in target.state_dict().items()}
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "source.pt"
                torch.save(payload, path)
                with self.subTest(failure=failure), self.assertRaises(ValueError):
                    load_training_checkpoint(target, path)
            self.assertTrue(all(torch.equal(v, before[k]) for k, v in target.state_dict().items()))


if __name__ == "__main__":
    unittest.main()
