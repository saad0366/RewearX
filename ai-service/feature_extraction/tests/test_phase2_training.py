"""Phase 2 uses synthetic fixtures only; no real dataset optimization."""

import argparse
import csv
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import torch
from PIL import Image

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES
from feature_extraction.training.dataset import PartialLabelDataset
from feature_extraction.training.engine import configure_stage, run_epoch
from feature_extraction.training.phase2 import (
    ACTIVE_HEADS, FROZEN_HEADS, prepare_phase2, phase2_weights, frozen_snapshot,
    assert_frozen_unchanged, selection_score, file_sha256,
)
from feature_extraction.training.phase2_runner import run_phase2
from feature_extraction.training.checkpoints import load_training_checkpoint


class TinyModel(torch.nn.Module):
    def __init__(self, labels=CLASS_NAMES):
        super().__init__()
        self.class_names = dict(labels)
        self.backbone = torch.nn.Sequential(torch.nn.Linear(3, 4), torch.nn.ReLU(), torch.nn.Linear(4, 4))
        self.heads = torch.nn.ModuleDict({h: torch.nn.Linear(4, len(labels[h])) for h in HEAD_NAMES})

    def forward(self, images):
        features = self.backbone(images.mean(dim=(2, 3)))
        return {h: head(features) for h, head in self.heads.items()}


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.images = self.root / "images"
        self.images.mkdir()
        self.manifest = self.root / "phase2_manifest.csv"
        self.split_file = self.root / "splits.json"
        self.rows = []
        for i in range(60):
            name = f"{i}.png"
            Image.new("RGB", (24, 24), (i, i * 3 % 256, 50)).save(self.images / name)
            labels = {h: CLASS_NAMES[h][0] for h in HEAD_NAMES}
            labels["pattern"] = "embroidered" if i % 2 else "plain"
            self.rows.append({**labels, "image_path": f"Z:\\old\\{name}", "image_identifier": name,
                              "parsed_colors": json.dumps(["black", "gold"]), "parser_version": "pakistani_caption_v2",
                              "review_required": "1", **{f"{h}_valid": "1" for h in HEAD_NAMES}})
        self.write()

    def write(self):
        with self.manifest.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(self.rows[0]))
            writer.writeheader()
            writer.writerows(self.rows)

    def prepare(self):
        return prepare_phase2(self.manifest, self.split_file, image_root=self.images)

    def test_deterministic_persistence_and_identical_image_grouping(self):
        self.rows.append(dict(self.rows[0]))
        # A different filename with identical bytes must share the split, too.
        (self.images / "copy.png").write_bytes((self.images / "0.png").read_bytes())
        self.rows.append({**self.rows[0], "image_identifier": "copy.png"})
        self.write()
        before = file_sha256(self.manifest)
        splits, metadata = self.prepare()
        first = self.split_file.read_bytes()
        again, _ = self.prepare()
        self.assertEqual(splits, again)
        self.assertEqual(first, self.split_file.read_bytes())
        self.assertEqual(before, file_sha256(self.manifest))
        entries = json.loads(first)["assignments"]
        self.assertEqual(entries[0]["split"], entries[-1]["split"])
        self.assertEqual(entries[0]["split"], entries[-2]["split"])
        self.assertEqual(metadata["review_rows_retained"], 62)
        self.assertEqual(sum(metadata["split_rows"].values()), 62)
        self.assertEqual(set(splits), {"train", "val", "test"})
        self.assertTrue(all(splits.values()))
        with self.assertRaisesRegex(ValueError, "Persisted split"):
            prepare_phase2(self.manifest, self.split_file, image_root=self.images, seed=43)

    def test_validity_masks_override_stale_labels_without_dropping_row(self):
        self.rows[0].update(category="not_a_class", category_valid="0", pattern="embroidered", pattern_valid="1")
        self.rows[1].update(parsed_colors="invalid ignored JSON", color_valid="0")
        self.write()
        splits, metadata = self.prepare()
        records = [record for records in splits.values() for record in records]
        first = next(record for record in records if record[0].name == "0.png")
        self.assertIsNone(first[1]["category"])
        self.assertEqual(first[1]["pattern"], "embroidered")
        dataset = PartialLabelDataset([first], "val")
        _, targets, masks = dataset[0]
        self.assertFalse(masks["category"].item())
        self.assertTrue(masks["pattern"].item())
        self.assertEqual(targets["color"].sum().item(), 2.)
        self.assertEqual(metadata["rows"], 60)

    def test_invalid_mask_and_missing_image_fail_explicitly(self):
        self.rows[0]["pattern_valid"] = "maybe"
        self.write()
        with self.assertRaisesRegex(ValueError, "must be 0 or 1"):
            self.prepare()
        self.rows[0]["pattern_valid"] = "1"
        self.rows[0]["image_identifier"] = "missing.png"
        self.write()
        with self.assertRaises(FileNotFoundError):
            self.prepare()

    def test_train_only_weighting(self):
        splits, _ = self.prepare()
        train = PartialLabelDataset(splits["train"], "train")
        ce, pos = phase2_weights(train.records)
        # All color-labeled training rows contain black and gold, never blue.
        self.assertEqual(pos[0].item(), 1.)
        self.assertEqual(pos[-1].item(), 1.)
        self.assertEqual(pos[3].item(), 0.)
        self.assertEqual(ce["category"][0].item(), 1.)
        self.assertEqual(ce["category"][1:].sum().item(), 0.)
        # Poisoning held-out annotations cannot affect weights from TRAIN records.
        splits["val"][:] = [(self.images / "0.png", {"color": ["blue"], "category": "kurti"})] * 100
        ce_again, pos_again = phase2_weights(train.records)
        torch.testing.assert_close(pos, pos_again)
        for head in ce:
            torch.testing.assert_close(ce[head], ce_again[head])

    def test_synthetic_two_stage_runner_preserves_source_and_frozen_heads(self):
        legacy = dict(CLASS_NAMES)
        legacy["color"] = (*CLASS_NAMES["color"][:-1], "multicolor")
        legacy["category"] = CLASS_NAMES["category"][:-1]
        source_model = TinyModel(legacy)
        source = self.root / "phase1.pt"
        torch.save({"format_version": 1, "architecture": "efficientnet_b0_six_head_v1", "trained": False,
                    "class_names": legacy, "state_dict": source_model.state_dict()}, source)
        original_hash = file_sha256(source)
        target = TinyModel()
        report = load_training_checkpoint(target, source)
        self.assertEqual(set(report["reset_heads"]), {"color", "category"})
        self.assertTrue(torch.equal(target.heads.pattern.weight, source_model.heads.pattern.weight))
        output = self.root / "phase2.pt"
        args = argparse.Namespace(output=str(output), init_checkpoint=str(source), split_file=str(self.split_file),
                                  manifest=str(self.manifest), image_root=str(self.images), seed=42, batch_size=16,
                                  head_epochs=1, finetune_epochs=1, head_lr=0.01, finetune_lr=0.001, final_blocks=1)
        optimizer_parameters = []
        original_optimizer = torch.optim.AdamW

        def capture(params, **kwargs):
            optimizer_parameters.extend(id(p) for p in params)
            return original_optimizer(params, **kwargs)

        with patch("feature_extraction.training.phase2_runner.ClothingModel", return_value=target), \
             patch("feature_extraction.training.phase2_runner.torch.optim.AdamW", side_effect=capture), \
             patch("builtins.print"):
            run_phase2(args, torch.device("cpu"))
        for head in FROZEN_HEADS:
            for p in target.heads[head].parameters():
                self.assertFalse(p.requires_grad)
                self.assertNotIn(id(p), optimizer_parameters)
            self.assertTrue(torch.equal(target.heads[head].weight, source_model.heads[head].weight))
            self.assertTrue(torch.equal(target.heads[head].bias, source_model.heads[head].bias))
        self.assertEqual(original_hash, file_sha256(source))
        checkpoint = torch.load(output, weights_only=True, map_location="cpu")
        self.assertFalse(checkpoint["trained"])
        self.assertEqual(set(checkpoint["state_dict"]), set(target.state_dict()))
        metadata = checkpoint["training_metadata"]
        self.assertEqual(metadata["active_heads"], list(ACTIVE_HEADS))
        self.assertEqual(metadata["frozen_heads"], list(FROZEN_HEADS))
        self.assertEqual(metadata["parser_versions"], ["pakistani_caption_v2"])
        self.assertEqual(set(metadata["class_weights"]), {"category", "pattern"})
        self.assertEqual(len(metadata["color_pos_weight"]), len(CLASS_NAMES["color"]))
        self.assertTrue(metadata["frozen_heads_verified"])
        self.assertIn("validation_metrics", metadata)
        self.assertTrue(output.with_suffix(".test_metrics.json").is_file())


class MetricAndFreezeTests(unittest.TestCase):
    def test_category_pattern_masks_are_independent_and_loss_uses_only_valid_rows(self):
        outputs = {h: torch.zeros(3, len(CLASS_NAMES[h])) for h in ("category", "pattern")}
        outputs["category"][0, 1] = 3.
        outputs["pattern"][1, 2] = 4.
        outputs["category"][1:] = float("nan")
        outputs["pattern"][[0, 2]] = float("nan")

        class Fixed(torch.nn.Module):
            def forward(self, images):
                return outputs

        targets = {h: torch.full((3,), -100) for h in HEAD_NAMES}
        masks = {h: torch.zeros(3, dtype=torch.bool) for h in HEAD_NAMES}
        targets["category"][0] = 1
        targets["pattern"][1] = 2
        masks["category"][0] = True
        masks["pattern"][1] = True
        weights = {h: torch.arange(1, len(CLASS_NAMES[h]) + 1).float() for h in outputs}
        metrics = run_epoch(Fixed(), [(torch.zeros(3, 1), targets, masks)], torch.device("cpu"),
                            active_heads=("category", "pattern"), class_weights=weights)
        for head, index in (("category", 0), ("pattern", 1)):
            expected = torch.nn.functional.cross_entropy(outputs[head][index:index + 1],
                       targets[head][index:index + 1], weight=weights[head], reduction="none").item()
            self.assertAlmostEqual(metrics["heads"][head]["loss"], expected)
            self.assertEqual(metrics["heads"][head]["labeled_samples"], 1)
            self.assertEqual(metrics["heads"][head]["accuracy"], 1.)
        self.assertEqual(metrics["samples"], 3)

    def test_zero_counts_and_rare_class_caps(self):
        records = [(None, {"color": None, "category": -100, "pattern": -100})] * 2
        ce, pos = phase2_weights(records)
        self.assertTrue(all(torch.isfinite(w).all() and w.sum() == 0 for w in ce.values()))
        self.assertEqual(pos.sum().item(), 0.)
        records = [(None, {"color": [1.] + [0.] * 11, "category": 0, "pattern": 0})] * 1000
        records.append((None, {"color": [0., 1.] + [0.] * 10, "category": 1, "pattern": 1}))
        ce, pos = phase2_weights(records)
        self.assertEqual(pos[1].item(), 20.)
        self.assertEqual(ce["pattern"][1].item(), 10.)
        self.assertEqual(ce["category"][2].item(), 0.)

    def test_masked_multilabel_metrics_and_zero_valid_batches(self):
        class Fixed(torch.nn.Module):
            def forward(self, images):
                return {"color": images}
        logits = torch.full((3, 12), -10.)
        logits[0, 0] = 10.
        logits[1, 0] = 10.  # False-positive black; gold is missed.
        targets = {h: torch.full((3,), -100) for h in HEAD_NAMES}
        targets["color"] = torch.zeros(3, 12)
        targets["color"][0, 0] = 1.
        targets["color"][1, -1] = 1.
        targets["color"][2] = float("nan")
        masks = {h: torch.zeros(3, dtype=torch.bool) for h in HEAD_NAMES}
        masks["color"][:2] = True
        result = run_epoch(Fixed(), [(logits, targets, masks)], torch.device("cpu"), active_heads=("color",))
        color = result["heads"]["color"]
        self.assertEqual(color["labeled_samples"], 2)
        self.assertAlmostEqual(color["micro_f1"], 0.5)
        self.assertAlmostEqual(color["macro_f1"], 1 / 3, places=6)
        self.assertEqual(color["per_class"]["black"]["precision"], 0.5)
        self.assertEqual(color["per_class"]["black"]["recall"], 1.)
        self.assertEqual(color["per_class"]["gold"]["positive_samples"], 1)
        masks["color"][:] = False
        with patch.object(Fixed, "forward", side_effect=AssertionError("Must not forward empty supervision")):
            empty = run_epoch(Fixed(), [(logits, targets, masks)], torch.device("cpu"),
                              active_heads=("color",), allow_empty=True)
        self.assertIsNone(empty["heads"]["color"]["micro_f1"])

    def test_frozen_weights_both_stages_and_selection_not_raw_loss(self):
        model = TinyModel()
        before = frozen_snapshot(model)
        for blocks in (0, 1):
            configure_stage(model, blocks, ACTIVE_HEADS)
            assert_frozen_unchanged(model, before)
            self.assertEqual({h for h in HEAD_NAMES if model.heads[h].weight.requires_grad}, set(ACTIVE_HEADS))
        metrics = {"total_loss": 999., "heads": {"color": {"macro_f1": 0.6},
                   "category": {"per_class": {"a": {"accuracy": 1., "labeled_samples": 1000},
                                               "b": {"accuracy": 0., "labeled_samples": 1}}},
                   "pattern": {"per_class": {"a": {"accuracy": 0.4, "labeled_samples": 1}}}}}
        self.assertAlmostEqual(selection_score(metrics), 0.5)
        with torch.no_grad():
            model.heads.sleeve_length.bias.add_(1.)
        with self.assertRaisesRegex(RuntimeError, "Frozen head changed"):
            assert_frozen_unchanged(model, before)


if __name__ == "__main__":
    unittest.main()
