"""Synthetic Phase 1 tests only; no real dataset training or weight downloads."""

import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import torch
from PIL import Image

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES
from feature_extraction.model import ClothingModel
from feature_extraction.inference_service import ImageInferenceService
from feature_extraction.train import main
from feature_extraction.training.adapters.deepfashion_multimodal import (
    ACTIVE_HEADS, load_deepfashion, read_annotations, split_for_filename,
)
from feature_extraction.training.dataset import PartialLabelDataset, ClothingDataset
from feature_extraction.training.engine import configure_stage, run_epoch, build_checkpoint, save_checkpoint


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def annotations(self, name, content):
        path = self.root / name
        path.write_text(content, encoding="utf-8")
        return path

    def test_sleeves_use_first_value_and_map_all_codes(self):
        path = self.annotations("shape.txt", "\n".join(f"image_{i}.jpg {i} 3 2 1" for i in range(6)))
        labels = read_annotations(path, "shape")
        self.assertEqual(list(labels.values()), ["sleeveless", "short", "three_quarter", "full", None, None])

    def test_all_pattern_codes_and_priority(self):
        path = self.annotations("pattern.txt", "\n".join(f"image_{i}.jpg {i} 7 7" for i in range(8)))
        self.assertEqual(list(read_annotations(path, "pattern").values()),
                         ["floral", "printed", "striped", "plain", "checked", None, None, None])
        path.write_text("upper.jpg 0 1 2\nlower.jpg 5 1 2\nouter.jpg 6 7 4\nnone.jpg 5 6 7\n")
        self.assertEqual(read_annotations(path, "pattern"),
                         {"upper.jpg": "floral", "lower.jpg": "printed", "outer.jpg": "checked", "none.jpg": None})

    def test_bad_rows_and_duplicates_rejected(self):
        for kind, text in (("shape", "a.jpg 6"), ("shape", "a.jpg"), ("shape", "a.jpg bad"),
                           ("pattern", "a.jpg 0 1"), ("pattern", "a.jpg 0 1 9"),
                           ("shape", "a.jpg 0\na.jpg 1"), ("shape", "../a.jpg 0")):
            with self.subTest(text=text), self.assertRaises(ValueError):
                read_annotations(self.annotations("bad.txt", text), kind)

    def test_group_split_is_stable_and_keeps_views_together(self):
        self.assertEqual(split_for_filename("MEN-id_00000001-01.jpg"),
                         split_for_filename("WOMEN-id_00000001-02.jpg"))
        self.assertEqual(split_for_filename("MEN-id_00000001-01.jpg"),
                         split_for_filename("MEN-id_00000001-01.jpg"))
        with self.assertRaises(ValueError):
            split_for_filename("no_identifier.jpg")

    def test_join_missing_files_and_coverage(self):
        names = [f"MEN-id_{i:08d}-01.jpg" for i in range(4)]
        for name in names[:3]:
            Image.new("RGB", (32, 32)).save(self.root / name)
        shape = self.annotations("shape.txt", f"{names[0]} 1 3\n{names[2]} 5\n{names[3]} 0\n")
        pattern = self.annotations("pattern.txt", f"{names[1]} 7 2 7\n{names[2]} 5 6 7\n")
        splits, report = load_deepfashion(self.root, shape, pattern)
        self.assertEqual(report["missing_images"], [names[3]])
        self.assertEqual(report["images_without_usable_labels"], 1)
        self.assertEqual(report["label_coverage"]["sleeve_length"]["labeled"], 1)
        self.assertEqual(report["label_coverage"]["pattern"]["classes"]["striped"], 1)
        self.assertEqual(sum(len(records) for records in splits.values()), 2)

    def test_six_slots_masks_and_missing_sentinel(self):
        path = self.root / "image.png"
        Image.new("RGB", (32, 32)).save(path)
        data = PartialLabelDataset([(path, {"sleeve_length": "short"})], "val")
        image, targets, masks = data[0]
        self.assertEqual(tuple(image.shape), (3, 224, 224))
        self.assertEqual(set(targets), set(HEAD_NAMES))
        self.assertEqual(set(masks), set(HEAD_NAMES))
        for head in HEAD_NAMES:
            self.assertEqual(masks[head].dtype, torch.bool)
            self.assertEqual(masks[head].item(), head == "sleeve_length")
            if head == "color":
                self.assertEqual(targets[head].sum().item(), 0.)
                self.assertEqual(targets[head].dtype, torch.float32)
                continue
            self.assertEqual(targets[head].item(), CLASS_NAMES[head].index("short") if head == "sleeve_length" else -100)

    def test_csv_blank_labels_are_missing(self):
        Image.new("RGB", (32, 32)).save(self.root / "image.png")
        manifest = self.annotations("data.csv", "image_path," + ",".join(HEAD_NAMES) + ",split\nimage.png,,,,,full,,train\n")
        _, targets, masks = ClothingDataset(manifest, "train")[0]
        self.assertEqual(sum(mask.item() for mask in masks.values()), 1)
        self.assertEqual(targets["color"].sum().item(), 0.)
        self.assertFalse(masks["color"].item())


class TinySixHead(torch.nn.Module):
    """Small optimizer fixture, deliberately not the production architecture."""
    def __init__(self):
        super().__init__()
        self.backbone = torch.nn.Sequential(torch.nn.Linear(2, 2))
        self.heads = torch.nn.ModuleDict({h: torch.nn.Linear(2, len(CLASS_NAMES[h])) for h in HEAD_NAMES})

    def forward(self, images):
        features = self.backbone(images)
        return {h: head(features) for h, head in self.heads.items()}


def batch(size, supervised):
    targets = {h: torch.full((size,), -100, dtype=torch.long) for h in HEAD_NAMES}
    masks = {h: torch.zeros(size, dtype=torch.bool) for h in HEAD_NAMES}
    for head, indices in supervised.items():
        targets[head][indices] = 0
        masks[head][indices] = True
    return torch.ones(size, 2), targets, masks


class MaskedTrainingTests(unittest.TestCase):
    def test_loss_and_metrics_use_labeled_counts(self):
        class Constant(torch.nn.Module):
            def forward(self, images):
                return {h: torch.zeros(len(images), len(CLASS_NAMES[h])) for h in HEAD_NAMES}
        first = batch(3, {"sleeve_length": [0, 2], "pattern": [1], "color": [0, 1, 2]})
        first[1]["sleeve_length"][2] = 1
        metrics = run_epoch(Constant(), [first, batch(2, {"pattern": [0, 1]})],
                            torch.device("cpu"), active_heads=ACTIVE_HEADS)
        self.assertEqual(metrics["heads"]["sleeve_length"]["labeled_samples"], 2)
        self.assertEqual(metrics["heads"]["pattern"]["labeled_samples"], 3)
        self.assertEqual(metrics["heads"]["sleeve_length"]["accuracy"], 0.5)
        self.assertIsNone(metrics["heads"]["color"]["loss"])
        self.assertAlmostEqual(metrics["total_loss"], math.log(5) + math.log(6), places=5)

    def test_inactive_and_unsupervised_heads_stay_unchanged(self):
        torch.manual_seed(7)
        model = TinySixHead()
        configure_stage(model, active_heads=ACTIVE_HEADS)
        before = {k: v.clone() for k, v in model.state_dict().items()}
        optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=0.01)
        run_epoch(model, [batch(2, {"sleeve_length": [0, 1], "color": [0, 1]})],
                  torch.device("cpu"), optimizer, active_heads=ACTIVE_HEADS)
        for key, value in model.state_dict().items():
            if not key.startswith("heads.sleeve_length."):
                torch.testing.assert_close(value, before[key], rtol=0, atol=0)
        self.assertFalse(torch.equal(model.heads.sleeve_length.weight, before["heads.sleeve_length.weight"]))
        for head in HEAD_NAMES:
            self.assertEqual(model.heads[head].weight.requires_grad, head in ACTIVE_HEADS)

    def test_all_missing_batch_does_not_step(self):
        model = TinySixHead()
        configure_stage(model, active_heads=ACTIVE_HEADS)
        optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad))
        with patch.object(optimizer, "step", wraps=optimizer.step) as step:
            with self.assertRaisesRegex(ValueError, "No available labels"):
                run_epoch(model, [batch(2, {})], torch.device("cpu"), optimizer, active_heads=ACTIVE_HEADS)
            step.assert_not_called()

    def test_phase1_checkpoint_full_state_and_not_inference_ready(self):
        model = ClothingModel(backbone_weights=None)
        metrics = {"total_loss": 2.0, "heads": {
            h: {"loss": 1.0 if h in ACTIVE_HEADS else None,
                "accuracy": 0.5 if h in ACTIVE_HEADS else None} for h in HEAD_NAMES}}
        coverage = {"sleeve_length": 3, "pattern": 4}
        checkpoint = build_checkpoint(model, 1, metrics, "heads", {}, active_heads=ACTIVE_HEADS,
                                      phase="phase1", label_coverage=coverage)
        self.assertIs(checkpoint["trained"], False)
        self.assertEqual(set(checkpoint["state_dict"]), set(model.state_dict()))
        for head in HEAD_NAMES:
            self.assertIn(f"heads.{head}.weight", checkpoint["state_dict"])
        self.assertEqual(checkpoint["training_metadata"]["phase"], "phase1")
        self.assertEqual(checkpoint["training_metadata"]["label_coverage"], coverage)
        self.assertEqual(checkpoint["class_names"], CLASS_NAMES)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "phase1.pt"
            save_checkpoint(checkpoint, path)
            loaded = torch.load(path, map_location="cpu", weights_only=True)
            model.load_state_dict(loaded["state_dict"], strict=True)
            with self.assertLogs("feature_extraction.inference_service", level="ERROR"):
                self.assertFalse(ImageInferenceService(str(path)).load_checkpoint())

    def test_phase1_cli_rejects_backbone_finetuning_before_model_creation(self):
        with patch("feature_extraction.train.ClothingModel") as constructor:
            with self.assertRaises(SystemExit):
                main(["--dataset", "deepfashion-multimodal", "--phase", "phase1",
                      "--image-root", "images", "--shape-labels", "shape", "--pattern-labels", "pattern",
                      "--finetune-epochs", "1"])
            constructor.assert_not_called()

    def test_phase1_command_wires_active_heads_and_checkpoint_metadata(self):
        # Exercise orchestration without real images, model downloads, or epochs.
        model = TinySixHead()
        model.class_names = CLASS_NAMES
        records = [(Path("unused.png"), {"sleeve_length": "full", "pattern": "plain"})]
        report = {"missing_images": [], "splits": {
            split: {"label_coverage": {h: {"labeled": 1} for h in ACTIVE_HEADS}}
            for split in ("train", "val")}}
        metrics = {"total_loss": 2.0, "heads": {
            h: {"loss": 1.0 if h in ACTIVE_HEADS else None,
                "accuracy": 0.5 if h in ACTIVE_HEADS else None} for h in HEAD_NAMES}}
        with tempfile.TemporaryDirectory() as directory, \
             patch("feature_extraction.train.load_deepfashion", return_value=({"train": records, "val": [(Path("val.png"), {"sleeve_length": "short", "pattern": "floral"})]}, report)), \
             patch("feature_extraction.train.ClothingModel", return_value=model), \
             patch("feature_extraction.train.run_epoch", return_value=metrics) as epoch, \
             patch("feature_extraction.train.save_checkpoint") as save, \
             patch("builtins.print"):
            main(["--dataset", "deepfashion-multimodal", "--phase", "phase1",
                  "--image-root", "images", "--shape-labels", "shape", "--pattern-labels", "pattern",
                  "--head-epochs", "1", "--output", str(Path(directory) / "new.pt")])
        self.assertEqual(epoch.call_count, 2)
        self.assertEqual(epoch.call_args_list[0].args[-1], ACTIVE_HEADS)
        self.assertEqual(epoch.call_args_list[1].kwargs["active_heads"], ACTIVE_HEADS)
        save.assert_called_once()
        checkpoint = save.call_args.args[0]
        self.assertIs(checkpoint["trained"], False)
        self.assertEqual(checkpoint["training_metadata"]["label_coverage"], report)
        # Validation-only classes must not affect training frequencies or weights.
        weights = epoch.call_args_list[0].kwargs["class_weights"]
        self.assertEqual(weights["sleeve_length"].tolist(), [0., 0., 0., 0., 1.])
        self.assertEqual(weights["pattern"].tolist(), [1., 0., 0., 0., 0., 0.])
        self.assertIs(epoch.call_args_list[1].kwargs["class_weights"], weights)
        self.assertEqual(checkpoint["training_metadata"]["class_weights"]["pattern"], weights["pattern"].tolist())
        for head in HEAD_NAMES:
            self.assertEqual(model.heads[head].weight.requires_grad, head in ACTIVE_HEADS)
        self.assertTrue(all(not p.requires_grad for p in model.backbone.parameters()))


if __name__ == "__main__":
    unittest.main()
