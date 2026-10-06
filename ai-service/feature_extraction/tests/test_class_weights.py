"""Synthetic class balancing and validation metrics checks; no dataset training."""

import math
import unittest

import torch

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES
from feature_extraction.training.engine import compute_class_weights, run_epoch


class ClassWeightTests(unittest.TestCase):
    def test_inverse_frequency_missing_and_zero_classes(self):
        records = [(None, {"sleeve_length": sleeve, "pattern": pattern})
                   for sleeve, pattern in [(0, 0), (0, 0), (0, 1), (1, -100), (-100, 1)]]
        weights = compute_class_weights(records, ("sleeve_length", "pattern"))
        torch.testing.assert_close(weights["sleeve_length"], torch.tensor([2 / 3, 2., 0., 0., 0.]))
        torch.testing.assert_close(weights["pattern"], torch.tensor([1., 1., 0., 0., 0., 0.]))
        self.assertEqual(set(weights), {"sleeve_length", "pattern"})
        self.assertAlmostEqual((3 * weights["sleeve_length"][0] + weights["sleeve_length"][1]).item() / 4, 1.)

    def test_no_training_labels_rejected(self):
        with self.assertRaisesRegex(ValueError, "No training labels"):
            compute_class_weights([(None, {"pattern": -100})], ("pattern",))

    def test_single_observed_class_has_unit_weight(self):
        weights = compute_class_weights([(None, {"pattern": 3})] * 7, ("pattern",))
        torch.testing.assert_close(weights["pattern"], torch.tensor([0., 0., 0., 1., 0., 0.]))

    def test_weighted_loss_mask_and_per_class_accuracy(self):
        class Logits(torch.nn.Module):
            def forward(self, images):
                # One correct class-0, one incorrect class-1; masked row ignored.
                return {"pattern": torch.zeros(len(images), 6)}
        targets = {h: torch.full((3,), -100, dtype=torch.long) for h in HEAD_NAMES}
        masks = {h: torch.zeros(3, dtype=torch.bool) for h in HEAD_NAMES}
        targets["pattern"] = torch.tensor([0, 1, -100])
        masks["pattern"] = torch.tensor([True, True, False])
        weights = {"pattern": torch.tensor([0.5, 2., 0., 0., 0., 0.])}
        data = (torch.ones(3, 2), targets, masks)
        result = run_epoch(Logits(), [data], torch.device("cpu"), active_heads=("pattern",), class_weights=weights)
        head = result["heads"]["pattern"]
        self.assertAlmostEqual(head["loss"], math.log(6) * 2.5 / 2, places=5)
        self.assertEqual(head["accuracy"], 0.5)
        self.assertEqual(head["labeled_samples"], 2)
        self.assertEqual(head["per_class"]["plain"], {"accuracy": 1., "labeled_samples": 1})
        self.assertEqual(head["per_class"]["striped"], {"accuracy": 0., "labeled_samples": 1})
        self.assertIsNone(head["per_class"]["embroidered"]["accuracy"])
        # The epoch loss must not depend on batch boundaries.
        parts = [(data[0][i:i+1], {h: t[i:i+1] for h, t in targets.items()},
                  {h: m[i:i+1] for h, m in masks.items()}) for i in range(3)]
        split = run_epoch(Logits(), parts, torch.device("cpu"), active_heads=("pattern",), class_weights=weights)
        self.assertEqual(result, split)

    def test_unseen_validation_class_has_zero_loss_but_reported_accuracy(self):
        class Logits(torch.nn.Module):
            def forward(self, images):
                return {"pattern": torch.zeros(len(images), 6)}
        targets = {h: torch.tensor([5]) for h in HEAD_NAMES}
        masks = {h: torch.tensor([h == "pattern"]) for h in HEAD_NAMES}
        result = run_epoch(Logits(), [(torch.ones(1, 2), targets, masks)], torch.device("cpu"),
                           active_heads=("pattern",), class_weights={"pattern": torch.tensor([1., 0., 0., 0., 0., 0.])})
        self.assertEqual(result["total_loss"], 0.)
        self.assertEqual(result["heads"]["pattern"]["per_class"]["embroidered"],
                         {"accuracy": 0., "labeled_samples": 1})


if __name__ == "__main__":
    unittest.main()
