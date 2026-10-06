"""Explicit deployment support; taxonomy/output shapes never change."""
import torch
from feature_extraction.clothing_config import CLASS_NAMES

UNSUPPORTED_CLASSES = {'category': ['skirt'], 'sleeve_length': ['half'], 'season': ['all_season']}
PREDICTION_POLICY = {'version': 'occasion_season_stage_a_v1',
                     'unsupported_classes': UNSUPPORTED_CLASSES,
                     'interpretation': 'Predictions and confidence are conditional on supported classes; unsupported inputs are not detected.'}

def mask_logits(head, logits):
    result = logits.clone()
    for label in UNSUPPORTED_CLASSES.get(head, []):
        result[..., CLASS_NAMES[head].index(label)] = -torch.inf
    return result

def supported_targets(head, targets):
    mask = torch.ones_like(targets, dtype=torch.bool)
    for label in UNSUPPORTED_CLASSES.get(head, []):
        mask &= targets != CLASS_NAMES[head].index(label)
    return mask
