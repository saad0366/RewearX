"""Multipart image inference endpoint; never serves untrained head outputs."""

from io import BytesIO
import warnings

from flask import Blueprint, current_app, jsonify, request
from PIL import Image, UnidentifiedImageError

from feature_extraction.inference_service import ImageModelNotReady
from feature_extraction.preprocessing import preprocess_image_bytes

image_bp = Blueprint("image", __name__)
SUPPORTED_TYPES = {"image/jpeg": "JPEG", "image/jpg": "JPEG",
                   "image/png": "PNG", "image/webp": "WEBP"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@image_bp.route("/api/image/extract", methods=["POST"])
def extract_image():
    if request.content_length and request.content_length > MAX_IMAGE_BYTES + 1024 * 1024:
        return jsonify(success=False, error="image_too_large"), 413
    uploads = request.files.getlist("image")
    if not uploads or not uploads[0].filename:
        return jsonify(success=False, error="missing_image"), 400
    if len(uploads) != 1 or len(list(request.files.items(multi=True))) != 1:
        return jsonify(success=False, error="expected_one_image"), 400
    upload = uploads[0]
    if upload.mimetype not in SUPPORTED_TYPES:
        return jsonify(success=False, error="unsupported_image_type"), 415
    data = upload.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        return jsonify(success=False, error="image_too_large"), 413
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format != SUPPORTED_TYPES[upload.mimetype]:
                    return jsonify(success=False, error="unsupported_image_type"), 415
                image.verify()
            tensor = preprocess_image_bytes(data)
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError,
            Image.DecompressionBombError, Image.DecompressionBombWarning):
        return jsonify(success=False, error="invalid_image"), 400

    service = current_app.extensions["image_inference_service"]
    try:
        if hasattr(service, "predict_with_version"):
            predictions, checkpoint_hash = service.predict_with_version(tensor)
        else:
            predictions = service.predict(tensor)
            checkpoint_hash = service.checkpoint_sha256
    except ImageModelNotReady:
        return jsonify(success=False, error="image_model_not_ready"), 503
    except Exception:
        current_app.logger.exception("Image inference failed")
        return jsonify(success=False, error="image_inference_failed"), 500
    return jsonify(success=True, predictions=predictions,
                   model={"architecture": "efficientnet_b0_six_head_v2",
                          "checkpoint_sha256": checkpoint_hash}), 200


@image_bp.route("/api/image/status", methods=["GET"])
def image_status():
    service = current_app.extensions["image_inference_service"]
    return jsonify(ready=service.is_ready, model_version=getattr(service,"model_version","accepted-phase3"),
                   checkpoint_sha256=service.checkpoint_sha256, registry_error=getattr(service,"registry_error",None))
