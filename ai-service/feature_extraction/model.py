"""EfficientNet-B0 foundation; clothing classification heads are NOT trained."""

import torch
from torch import nn
from torchvision.models import EfficientNet_B0_Weights, efficientnet_b0

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES, validate_class_names


class ClothingModel(nn.Module):
    """One ImageNet backbone and six independent linear classification heads.

    forward() returns raw logits for future training/shape checks ONLY.
    Randomly initialized head outputs must not be presented as predictions.
    Construction can download official ImageNet weights if they are not cached.
    Importing this module does not construct or download a model.
    """

    def __init__(self, class_names=None, *, backbone_weights=EfficientNet_B0_Weights.IMAGENET1K_V1):
        super().__init__()
        self.class_names = validate_class_names(
            CLASS_NAMES if class_names is None else class_names
        )
        # The inference loader passes None before restoring a COMPLETE checkpoint.
        network = efficientnet_b0(weights=backbone_weights)
        self.feature_dim = network.classifier[1].in_features  # 1280 for B0
        self.backbone = network.features
        self.pool = network.avgpool
        # Discard the ImageNet 1000-class classifier. New heads start random.
        self.heads = nn.ModuleDict({
            name: nn.Linear(self.feature_dim, len(self.class_names[name]))
            for name in HEAD_NAMES
        })

    @property
    def prediction_status(self):
        return "use ImageInferenceService for checkpoint-validated predictions"

    def extract_features(self, images):
        """Map preprocessed [B, 3, 224, 224] images to [B, 1280]."""
        if images.ndim != 4 or tuple(images.shape[1:]) != (3, 224, 224):
            raise ValueError("Expected images shaped [batch, 3, 224, 224].")
        return torch.flatten(self.pool(self.backbone(images)), 1)

    def forward(self, images):
        """Return six raw [B, number_of_classes] logits, not valid predictions."""
        features = self.extract_features(images)
        return {name: head(features) for name, head in self.heads.items()}

    def predict(self, images):
        """Deliberately unavailable until trained-checkpoint inference is added."""
        raise RuntimeError(
            "Clothing predictions are unavailable: the six classification heads "
            "have no verified trained weights. ImageNet backbone weights alone "
            "do not provide clothing attribute predictions."
        )
