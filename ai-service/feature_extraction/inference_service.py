"""One lazily loaded clothing model per Flask app/process. No weight downloads."""

import hashlib
import logging
from pathlib import Path
from threading import Lock

import torch

from feature_extraction.clothing_config import (CLASS_NAMES, HEAD_NAMES, validate_class_names,
    ARCHITECTURE, FORMAT_VERSION, HEAD_TASKS, COLOR_THRESHOLD)
from feature_extraction.model import ClothingModel
from feature_extraction.prediction_policy import mask_logits, UNSUPPORTED_CLASSES, PREDICTION_POLICY

logger = logging.getLogger(__name__)
def decode_colors(logits, threshold=COLOR_THRESHOLD):
    """Independent sigmoid scores; multicolor is derived, never a trained class."""
    if not 0 < threshold < 1:
        raise ValueError("Color threshold must be between zero and one")
    if logits.shape != (len(CLASS_NAMES["color"]),) or not torch.isfinite(logits).all():
        raise ValueError("Invalid color logits")
    probabilities = torch.sigmoid(logits)
    indices = (probabilities >= threshold).nonzero().flatten().tolist()
    colors = [CLASS_NAMES["color"][i] for i in indices]
    label = None if not colors else colors[0] if len(colors) == 1 else colors if len(colors) == 2 else "multicolor"
    return {"label": label, "labels": colors,
            "confidence": min((probabilities[i].item() for i in indices), default=0.0),
            "probabilities": {name: probabilities[i].item() for i, name in enumerate(CLASS_NAMES["color"])}}



class ImageModelNotReady(RuntimeError):
    pass


class ImageInferenceService:
    def __init__(self, checkpoint_path="", expected_sha256=""):
        self.checkpoint_path = checkpoint_path
        self.expected_sha256 = expected_sha256.lower()
        self.checkpoint_sha256 = None
        self._model = None
        self._load_attempted = False
        self._lock = Lock()
        self.not_ready_reason = "checkpoint_not_loaded"
        self.model_version = "accepted-phase3"
        self.registry_error = None

    @property
    def is_ready(self):
        return self._model is not None

    def load_checkpoint(self):
        """Attempt once; publish the model only after all validation succeeds.

        Metadata declares training provenance; structural validation cannot prove
        training quality. Only configure checkpoints from a trusted training run.
        Restart the app after configuring/replacing a checkpoint.
        """
        with self._lock:
            if self._load_attempted:
                return self.is_ready
            self._load_attempted = True
            if not self.checkpoint_path:
                self.not_ready_reason = "checkpoint_not_configured"
                return False
            path = Path(self.checkpoint_path)
            if not path.is_absolute():
                path = Path(__file__).resolve().parents[1] / path
            if not path.is_file():
                self.not_ready_reason = "checkpoint_not_found"
                return False
            try:
                if self.expected_sha256:
                    with path.open("rb") as stream:
                        digest = hashlib.file_digest(stream, "sha256").hexdigest()
                    if digest != self.expected_sha256:
                        self.not_ready_reason = "checkpoint_hash_mismatch"
                        return False
                    self.checkpoint_sha256 = digest
                checkpoint = torch.load(path, map_location="cpu", weights_only=True)
                if not isinstance(checkpoint, dict):
                    raise ValueError("Checkpoint must be a dictionary.")
                if checkpoint.get("format_version") != FORMAT_VERSION:
                    raise ValueError("Unsupported checkpoint format_version.")
                if checkpoint.get("architecture") != ARCHITECTURE:
                    raise ValueError("Wrong checkpoint architecture.")
                if checkpoint.get("head_tasks") != HEAD_TASKS:
                    raise ValueError("Wrong checkpoint head tasks.")
                if checkpoint.get("trained") is not True:
                    raise ValueError("Checkpoint must declare trained=True.")
                if checkpoint.get('prediction_policy', PREDICTION_POLICY) != PREDICTION_POLICY:
                    raise ValueError('Checkpoint prediction-support policy differs from deployment.')
                labels = validate_class_names(checkpoint.get("class_names", {}))
                if labels != validate_class_names(CLASS_NAMES):
                    raise ValueError("Checkpoint class names/order do not match configuration.")
                state = checkpoint.get("state_dict")
                if not isinstance(state, dict) or not state:
                    raise ValueError("Missing full-model state_dict.")
                if any(not isinstance(v, torch.Tensor) or not torch.isfinite(v).all()
                       for v in state.values()):
                    raise ValueError("Checkpoint contains invalid/non-finite tensors.")
                model = ClothingModel(labels, backbone_weights=None)
                model.load_state_dict(state, strict=True)
                model.eval()
                model.requires_grad_(False)
                self._model = model
                self.not_ready_reason = None
                return True
            except Exception:
                self.not_ready_reason = "checkpoint_invalid"
                logger.exception("Image checkpoint rejected; image inference remains unavailable")
                return False

    def predict(self, image_tensor):
        return self.predict_with_version(image_tensor)[0]

    def predict_with_version(self, image_tensor):
        """Capture weights and hash together so a concurrent reload cannot mislabel a response."""
        if not self.load_checkpoint():
            raise ImageModelNotReady(self.not_ready_reason)
        with self._lock:
            model, digest = self._model, self.checkpoint_sha256
        with torch.inference_mode():
            logits = model(image_tensor.unsqueeze(0))
            predictions = {}
            for name in HEAD_NAMES:
                values = logits[name]
                if values.shape != (1, len(CLASS_NAMES[name])) or not torch.isfinite(values).all():
                    raise RuntimeError("Invalid image model output.")
                if name == "color":
                    predictions[name] = decode_colors(values[0])
                    continue
                confidence, index = torch.softmax(mask_logits(name, values[0]), dim=0).max(dim=0)
                predictions[name] = {
                    "label": CLASS_NAMES[name][index.item()],
                    "confidence": confidence.item(),
                }
                if name in UNSUPPORTED_CLASSES:
                    predictions[name].update(unsupported_classes=UNSUPPORTED_CLASSES[name],
                                             support_status="limited_classes",
                                             confidence_interpretation=PREDICTION_POLICY['interpretation'])
            return predictions, digest
