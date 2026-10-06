"""Run from ai-service with: python -m feature_extraction.app."""

import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

from feature_extraction.inference_service import ImageInferenceService
from feature_extraction.routes import image_bp

# Preserve the existing ai-service/.env location without importing NLP config.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def create_app():
    app = Flask(__name__)
    CORS(app)
    app.extensions["image_inference_service"] = ImageInferenceService(
        os.getenv("IMAGE_CHECKPOINT_PATH", ""),
        expected_sha256=os.getenv("IMAGE_CHECKPOINT_SHA256", "")
    )
    if os.getenv("IMAGE_LEARNING_ENABLED", "false") == "true":
        from feature_extraction.model_registry import start_registry_watch
        registry = os.getenv("IMAGE_MODEL_REGISTRY_DIR", str(Path(__file__).resolve().parent / "runtime" / "learning"))
        start_registry_watch(app.extensions["image_inference_service"], registry)
    app.register_blueprint(image_bp)
    return app


app = create_app()

if __name__ == "__main__":
    app.run(host=os.getenv("IMAGE_HOST", "0.0.0.0"),
            port=int(os.getenv("IMAGE_PORT", "5001")), debug=False)
