"""NLP route regression checks without model downloads or image imports."""

import sys
import unittest
from unittest.mock import patch

from app import create_app


class NlpServiceTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_health_and_image_isolation(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "running"})
        self.assertNotIn("image_inference_service", self.app.extensions)
        self.assertNotIn("image", self.app.blueprints)
        self.assertEqual(self.client.post("/api/image/extract").status_code, 404)
        self.assertNotIn("feature_extraction.inference_service", sys.modules)

    def test_nlp_embedding_route(self):
        with patch("routes.extract._nlp") as service:
            service.generate_embedding.return_value = [0.1, 0.2]
            response = self.client.post("/api/extract", json={"text": "purple shirt"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {"embedding": [0.1, 0.2], "dimensions": 2})
            service.generate_embedding.assert_called_once_with("purple shirt")

    def test_nlp_validation_and_routes(self):
        for endpoint in ("/api/extract", "/api/similarity", "/api/query/attributes", "/api/rank"):
            self.assertEqual(self.client.post(endpoint, json={}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
