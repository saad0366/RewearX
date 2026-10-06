"""Dataset label vocabularies. Tuple order defines each head's class indices."""

HEAD_NAMES = (
    "color",
    "occasion",
    "season",
    "category",
    "sleeve_length",
    "pattern",
)

# Finalized taxonomy. Preserve this order in dataset encoding and checkpoints.
# "occasion" is the Type / Occasion head.
CLASS_NAMES = {
    "color": (
        "black", "white", "grey", "blue", "green", "red", "pink", "purple", "brown",
        "beige", "yellow", "gold",
    ),
    "occasion": ("casual", "formal", "party", "wedding", "sports"),
    "season": ("summer", "winter", "all_season"),
    "category": (
        "t_shirt", "shirt", "hoodie", "sweater", "jacket", "jeans", "trousers",
        "dress", "skirt", "shalwar_kameez", "lehenga", "other_fashion",
    ),
    "sleeve_length": ("sleeveless", "short", "half", "three_quarter", "full"),
    "pattern": ("plain", "striped", "checked", "floral", "printed", "embroidered"),
}


def validate_class_names(class_names):
    """Return a validated copy, preserving the label order for each head."""
    if set(class_names) != set(HEAD_NAMES):
        raise ValueError(f"Class configuration must contain exactly: {HEAD_NAMES}")
    validated = {}
    for name in HEAD_NAMES:
        labels = class_names[name]
        if not isinstance(labels, (list, tuple)) or not labels:
            raise ValueError(f"Configure non-empty dataset labels for '{name}' first.")
        if any(not isinstance(label, str) or not label.strip() for label in labels):
            raise ValueError(f"Labels for '{name}' must be non-empty strings.")
        if len(set(labels)) != len(labels):
            raise ValueError(f"Duplicate labels in '{name}'.")
        validated[name] = tuple(labels)
    return validated


FORMAT_VERSION = 2
ARCHITECTURE = "efficientnet_b0_six_head_v2"
HEAD_TASKS = {head: "multilabel" if head == "color" else "multiclass" for head in HEAD_NAMES}
COLOR_THRESHOLD = 0.5
