"""Opt-in initialization of a new skirt row; does not load or save checkpoints."""
import math
import torch


def initialize_skirt_below_existing(model, margin=1.0):
    """Initialize skirt to mean(other 11 logits) - margin.

    For every finite feature vector, its logit is below the maximum preserved
    logit in exact arithmetic. No old kurti tensor or validation labels are used.
    This protects old-class argmax at initialization, not after future training,
    and does not preserve softmax probabilities. Float rounding must be checked.
    """
    if not math.isfinite(margin) or margin <= 0:
        raise ValueError('Positive finite margin required')
    if tuple(model.class_names['category'])[8] != 'skirt':
        raise ValueError('Expected skirt at category index 8')
    head=model.heads['category']
    if head.out_features != 12 or head.bias is None:
        raise ValueError('Expected 12-output linear category head')
    rows=[i for i in range(12) if i != 8]
    if not torch.isfinite(head.weight[rows]).all() or not torch.isfinite(head.bias[rows]).all():
        raise ValueError('Non-finite protected category parameters')
    with torch.no_grad():
        head.weight[8].copy_(head.weight[rows].mean(0))
        head.bias[8].copy_(head.bias[rows].mean()-margin)
    return dict(strategy='mean_preserved_logits_minus_margin',margin=margin,
                initialized_rows=[8],kurti_weights_used=False,validation_fitted=False)
