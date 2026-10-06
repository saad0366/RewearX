"""Offline structural checks. No pretrained downloads or training."""

from io import BytesIO
import unittest
from unittest.mock import patch

import torch
from PIL import Image, UnidentifiedImageError
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES, validate_class_names
from feature_extraction.model import ClothingModel
from feature_extraction.preprocessing import preprocess_image, preprocess_image_bytes


class ImageFoundationTests(unittest.TestCase):
    def test_configuration_rejects_missing_empty_and_duplicate_labels(self):
        with self.assertRaises(ValueError):
            validate_class_names({})
        with self.assertRaisesRegex(ValueError, "non-empty dataset labels"):
            ClothingModel({name: () for name in HEAD_NAMES})
        labels = {name: ("test_a", "test_b") for name in HEAD_NAMES}
        labels["color"] = ("duplicate", "duplicate")
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            validate_class_names(labels)

    def test_backbone_and_six_different_head_dimensions(self):
        # Test-only vocabularies verify that output sizes come from configuration.
        labels = {
            name: tuple(f"test_class_{i}" for i in range(count))
            for count, name in enumerate(HEAD_NAMES, start=2)
        }
        with patch("feature_extraction.model.efficientnet_b0") as build:
            build.return_value = efficientnet_b0(weights=None)
            model = ClothingModel(labels).eval()
            build.assert_called_once_with(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
        with torch.no_grad():
            images = torch.zeros(2, 3, 224, 224)
            maps = model.backbone(images)
            self.assertEqual(tuple(maps.shape), (2, 1280, 7, 7))
            self.assertEqual(tuple(model.extract_features(images).shape), (2, 1280))
            logits = model(images)
        self.assertEqual(set(logits), set(HEAD_NAMES))
        for name in HEAD_NAMES:
            self.assertEqual(tuple(logits[name].shape), (2, len(labels[name])))
            self.assertTrue(torch.isfinite(logits[name]).all())
        self.assertEqual(len({id(head.weight) for head in model.heads.values()}), 6)
        with self.assertRaisesRegex(RuntimeError, "no verified trained weights"):
            model.predict(images)
        with self.assertRaisesRegex(ValueError, "Expected images shaped"):
            model.extract_features(torch.zeros(3, 224, 224))

    def test_finalized_taxonomy_output_dimensions(self):
        self.assertEqual(CLASS_NAMES["color"], (
            "black", "white", "grey", "blue", "green", "red", "pink", "purple",
            "brown", "beige", "yellow", "gold",
        ))
        expected_counts = {
            "color": 12, "occasion": 5, "season": 3,
            "category": 12, "sleeve_length": 5, "pattern": 6,
        }
        self.assertEqual(
            {name: len(labels) for name, labels in validate_class_names(CLASS_NAMES).items()},
            expected_counts,
        )
        with patch("feature_extraction.model.efficientnet_b0") as build:
            build.return_value = efficientnet_b0(weights=None)
            model = ClothingModel().eval()
        with torch.no_grad():
            logits = model(torch.zeros(1, 3, 224, 224))
        self.assertEqual(
            {name: tuple(values.shape) for name, values in logits.items()},
            {name: (1, count) for name, count in expected_counts.items()},
        )

    def test_preprocessing_rgb_grayscale_rgba_and_normalization(self):
        for mode in ("RGB", "L", "RGBA"):
            with self.subTest(mode=mode):
                encoded = BytesIO()
                Image.new(mode, (400, 300), 0).save(encoded, format="PNG")
                tensor = preprocess_image_bytes(encoded.getvalue())
                self.assertEqual(tuple(tensor.shape), (3, 224, 224))
                self.assertEqual(tensor.dtype, torch.float32)
                self.assertTrue(torch.isfinite(tensor).all())
        black = preprocess_image(Image.new("RGB", (300, 300), 0))
        expected = -torch.tensor([0.485, 0.456, 0.406]) / torch.tensor([0.229, 0.224, 0.225])
        torch.testing.assert_close(black[:, 0, 0], expected)

    def test_preprocessing_applies_exif_orientation(self):
        image = Image.new("RGB", (300, 400))
        image.paste((255, 0, 0), (0, 0, 300, 200))
        image.getexif()[274] = 6  # 90 degrees clockwise
        rotated = image.transpose(Image.Transpose.ROTATE_270)
        rotated.getexif().pop(274, None)
        expected = preprocess_image(rotated)
        torch.testing.assert_close(preprocess_image(image), expected)

    def test_invalid_image_input_is_rejected(self):
        with self.assertRaises(ValueError):
            preprocess_image_bytes(b"")
        with self.assertRaises(UnidentifiedImageError):
            preprocess_image_bytes(b"not an image")
        with self.assertRaises(TypeError):
            preprocess_image("not a PIL image")


if __name__ == "__main__":
    unittest.main()
