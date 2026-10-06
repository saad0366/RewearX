"""Offline API/loader tests. Synthetic checkpoint tensors are never predicted."""

from io import BytesIO
from pathlib import Path
import unittest
from unittest.mock import patch

import torch
from PIL import Image
from werkzeug.datastructures import MultiDict

from feature_extraction.app import create_app
from feature_extraction.clothing_config import CLASS_NAMES, FORMAT_VERSION, HEAD_TASKS
from feature_extraction.prediction_policy import mask_logits, UNSUPPORTED_CLASSES
from feature_extraction.model import ClothingModel
from feature_extraction.inference_service import ARCHITECTURE, ImageInferenceService


def image_upload(fmt="PNG", mimetype="image/png"):
    stream = BytesIO()
    Image.new("RGB", (40, 60), "blue").save(stream, format=fmt)
    stream.seek(0)
    return stream, "test." + fmt.lower(), mimetype


class ImageApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.service = ImageInferenceService("")
        self.app.extensions["image_inference_service"] = self.service
        self.client = self.app.test_client()

    def test_route_registration(self):
        rules = [r for r in self.app.url_map.iter_rules() if r.rule == "/api/image/extract"]
        self.assertEqual(len(rules), 1)
        self.assertIn("POST", rules[0].methods)
        self.assertEqual(self.client.get("/api/image/extract").status_code, 405)

    def test_missing_image(self):
        response = self.client.post("/api/image/extract", data={})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json["error"], "missing_image")

    def test_only_image_routes_are_registered(self):
        self.assertEqual(set(self.app.blueprints), {"image"})
        for endpoint in ("/api/extract", "/api/similarity", "/api/query/attributes", "/api/rank"):
            self.assertEqual(self.client.post(endpoint, json={}).status_code, 404)

    def test_successful_response_and_softmax_decoding(self):
        # Explicit protocol logits, not predictions from untrained fixture weights.
        class ProtocolModel:
            def __call__(self, images):
                self.shape = tuple(images.shape)
                return {head: torch.arange(len(labels), dtype=torch.float32).unsqueeze(0)
                        for head, labels in CLASS_NAMES.items()}

        model = ProtocolModel()
        self.service._model = model
        self.service._load_attempted = True
        response = self.client.post("/api/image/extract", data={"image": image_upload()})
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.json["success"], True)
        self.assertEqual(model.shape, (1, 3, 224, 224))
        self.assertEqual(set(response.json["predictions"]), set(CLASS_NAMES))
        for head, labels in CLASS_NAMES.items():
            prediction = response.json["predictions"][head]
            if head == "color":
                self.assertEqual(prediction["label"], "multicolor")
                self.assertEqual(prediction["labels"], list(labels))
                self.assertAlmostEqual(prediction["probabilities"]["black"], 0.5)
                continue
            values=mask_logits(head,torch.arange(len(labels),dtype=torch.float32))
            index=values.argmax().item()
            self.assertEqual(prediction["label"], labels[index])
            if head in UNSUPPORTED_CLASSES:
                self.assertEqual(prediction['unsupported_classes'],UNSUPPORTED_CLASSES[head])
                self.assertEqual(prediction['support_status'],'limited_classes')
            expected = torch.softmax(values, dim=0)[index].item()
            self.assertAlmostEqual(prediction["confidence"], expected)

    def test_invalid_image(self):
        response = self.client.post("/api/image/extract", data={
            "image": (BytesIO(b"not an image"), "bad.jpg", "image/jpeg")})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json["error"], "invalid_image")

    def test_unsupported_or_disguised_type(self):
        for fmt, mime in (("GIF", "image/gif"), ("GIF", "image/png")):
            with self.subTest(fmt=fmt, mime=mime):
                response = self.client.post("/api/image/extract", data={"image": image_upload(fmt, mime)})
                self.assertEqual(response.status_code, 415)

    def test_duplicate_images(self):
        response = self.client.post("/api/image/extract", data=MultiDict([
            ("image", image_upload()), ("image", image_upload())]))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json["error"], "expected_one_image")

    def test_valid_image_without_checkpoint_is_503_and_reuses_service(self):
        with patch("feature_extraction.inference_service.ClothingModel") as constructor:
            for fmt, mime in (("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")):
                response = self.client.post("/api/image/extract", data={"image": image_upload(fmt, mime)})
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json, {"success": False, "error": "image_model_not_ready"})
            constructor.assert_not_called()
        self.assertIs(self.app.extensions["image_inference_service"], self.service)
        self.assertFalse(self.service.is_ready)
        self.assertEqual(self.service.not_ready_reason, "checkpoint_not_configured")


class CheckpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Structural fixture only, never used to produce classifications.
        cls.state = ClothingModel(backbone_weights=None).state_dict()

    def checkpoint(self):
        return {"format_version": FORMAT_VERSION, "architecture": ARCHITECTURE, "trained": True,
                "class_names": dict(CLASS_NAMES), "state_dict": self.state, "head_tasks": dict(HEAD_TASKS)}

    def test_missing_path_does_not_construct_a_model(self):
        with patch("feature_extraction.inference_service.Path.is_file", return_value=False), \
             patch("feature_extraction.inference_service.ClothingModel") as constructor:
            service = ImageInferenceService("missing.pt")
            self.assertFalse(service.load_checkpoint())
            constructor.assert_not_called()
            self.assertEqual(service.not_ready_reason, "checkpoint_not_found")

    def test_full_checkpoint_load_is_strict_offline_and_reused(self):
        with patch("feature_extraction.inference_service.Path.is_file", return_value=True), \
             patch("feature_extraction.inference_service.torch.load", return_value=self.checkpoint()) as load:
            service = ImageInferenceService("fixture.pt")
            self.assertTrue(service.load_checkpoint())
            model = service._model
            self.assertTrue(service.load_checkpoint())
            self.assertIs(service._model, model)
            self.assertFalse(model.training)
            self.assertTrue(all(not p.requires_grad for p in model.parameters()))
            self.assertEqual(load.call_count, 1)
            self.assertEqual(load.call_args.kwargs, {"map_location": "cpu", "weights_only": True})
            self.assertEqual(load.call_args.args[0], Path(__file__).resolve().parents[2] / "fixture.pt")

    def test_invalid_checkpoints_never_become_ready(self):
        invalid = []
        for key, value in (("trained", False), ("architecture", "wrong"), ("format_version", 99)):
            payload = self.checkpoint()
            payload[key] = value
            invalid.append(payload)
        payload = self.checkpoint()
        payload["class_names"]["color"] = tuple(reversed(CLASS_NAMES["color"]))
        invalid.append(payload)
        payload = self.checkpoint()
        payload["class_names"]["color"] = tuple(c for c in CLASS_NAMES["color"] if c != "purple")
        invalid.append(payload)
        payload = self.checkpoint()
        payload["state_dict"] = {k: v for k, v in self.state.items() if k != "heads.color.weight"}
        invalid.append(payload)
        payload = self.checkpoint()
        payload["state_dict"] = dict(self.state)
        payload["state_dict"]["heads.color.weight"] = self.state["heads.color.weight"][:1]
        invalid.append(payload)
        for payload in invalid:
            with self.subTest(keys=payload.keys()), \
                 patch("feature_extraction.inference_service.Path.is_file", return_value=True), \
                 patch("feature_extraction.inference_service.torch.load", return_value=payload), \
                 self.assertLogs("feature_extraction.inference_service", level="ERROR"):
                service = ImageInferenceService("fixture.pt")
                self.assertFalse(service.load_checkpoint())
                self.assertFalse(service.is_ready)
                self.assertIsNone(service._model)


if __name__ == "__main__":
    unittest.main()
