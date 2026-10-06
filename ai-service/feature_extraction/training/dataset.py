"""CSV-backed six-attribute clothing dataset."""

import csv
from pathlib import Path

import torch
from PIL import Image, ImageOps
from torch.utils.data import Dataset
from torchvision import transforms
from torchvision.transforms import InterpolationMode

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES
from feature_extraction.preprocessing import preprocess_image

REQUIRED_COLUMNS = ("image_path", *HEAD_NAMES, "split")
SPLITS = ("train", "val", "test")


def encode_color(label):
    """Complete atomic color sets; None/blank means the whole head is missing.

    CSV uses black|gold. A provided set treats unlisted colors as negatives.
    The derived display label multicolor is deliberately not a target class.
    """
    if label is None or label == "":
        return None
    values = [value.strip() for value in label.split("|")] if isinstance(label, str) else label
    if not isinstance(values, (list, tuple)) or not values or any(value not in CLASS_NAMES["color"] for value in values):
        raise ValueError(f"unknown color label: {label!r}")
    if len(set(values)) != len(values):
        raise ValueError("Duplicate color labels")
    return [float(color in values) for color in CLASS_NAMES["color"]]


class TrainingTransform:
    """Mild spatial augmentation; no hue changes that would corrupt color labels."""
    def __init__(self):
        self.transform = transforms.Compose([
            transforms.Resize(256, interpolation=InterpolationMode.BICUBIC),
            transforms.RandomCrop(224),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
        ])

    def __call__(self, image):
        return self.transform(ImageOps.exif_transpose(image).convert("RGB"))


class ClothingDataset(Dataset):
    def __init__(self, manifest, split, image_root=None):
        if split not in SPLITS:
            raise ValueError(f"Invalid requested split {split!r}; expected {SPLITS}.")
        manifest = Path(manifest).resolve()
        if not manifest.is_file():
            raise FileNotFoundError(f"CSV manifest not found: {manifest}")
        root = Path(image_root).resolve() if image_root else manifest.parent
        self.records = []
        self.transform = TrainingTransform() if split == "train" else preprocess_image
        seen_paths = set()
        with manifest.open(newline="", encoding="utf-8-sig") as stream:
            reader = csv.DictReader(stream)
            columns = reader.fieldnames or []
            missing = set(REQUIRED_COLUMNS) - set(columns)
            if missing or len(columns) != len(set(columns)):
                raise ValueError(f"Invalid CSV columns; missing={sorted(missing)}, headers must be unique.")
            # Validate every row, including rows in other splits, before training.
            for line, row in enumerate(reader, start=2):
                if None in row or any(row.get(name) is None for name in REQUIRED_COLUMNS):
                    raise ValueError(f"CSV row {line}: malformed row.")
                row = {key: value.strip() if isinstance(value, str) else value for key, value in row.items()}
                if row["split"] not in SPLITS:
                    raise ValueError(f"CSV row {line}: invalid split {row['split']!r}.")
                targets = {}
                for head in HEAD_NAMES:
                    if head == "color":
                        targets[head] = encode_color(row[head])
                        continue
                    if not row[head]:
                        targets[head] = -100
                        continue
                    if row[head] not in CLASS_NAMES[head]:
                        raise ValueError(f"CSV row {line}: unknown {head} label {row[head]!r}.")
                    targets[head] = CLASS_NAMES[head].index(row[head])
                if not row["image_path"]:
                    raise ValueError(f"CSV row {line}: image_path is empty.")
                image_path = (root / row["image_path"]).resolve()
                if not image_path.is_file():
                    raise FileNotFoundError(f"CSV row {line}: image file not found: {image_path}")
                if image_path in seen_paths:
                    raise ValueError(f"CSV row {line}: duplicate image path (possible split leakage): {image_path}")
                seen_paths.add(image_path)
                if row["split"] == split:
                    self.records.append((image_path, targets))
        if not self.records:
            raise ValueError(f"Manifest contains no images for split {split!r}.")

    def __len__(self):
        return len(self.records)

    def __getitem__(self, index):
        path, targets = self.records[index]
        try:
            with Image.open(path) as image:
                tensor = self.transform(image)
        except (OSError, ValueError) as exc:
            raise ValueError(f"Cannot decode/preprocess image {path}: {exc}") from exc
        encoded, masks = {}, {}
        for head, value in targets.items():
            if head == "color":
                encoded[head] = torch.tensor(value if value is not None else [0.] * len(CLASS_NAMES[head]), dtype=torch.float32)
                masks[head] = torch.tensor(value is not None, dtype=torch.bool)
            else:
                encoded[head] = torch.tensor(value, dtype=torch.long)
                masks[head] = torch.tensor(value != -100, dtype=torch.bool)
        return tensor, encoded, masks



class PartialLabelDataset(ClothingDataset):
    """Common adapter output: paths and optional labels, with six fixed slots."""
    def __init__(self, records, split):
        if split not in SPLITS:
            raise ValueError(f"Invalid requested split {split!r}")
        self.transform = TrainingTransform() if split == "train" else preprocess_image
        self.records = []
        for path, labels in records:
            if set(labels) - set(HEAD_NAMES):
                raise ValueError("Unknown label head")
            targets = {}
            for head in HEAD_NAMES:
                label = labels.get(head)
                if head == "color":
                    targets[head] = encode_color(label)
                    continue
                if label is not None and label not in CLASS_NAMES[head]:
                    raise ValueError(f"Unknown {head} label: {label}")
                targets[head] = -100 if label is None else CLASS_NAMES[head].index(label)
            self.records.append((Path(path), targets))
        if not self.records:
            raise ValueError(f"Dataset contains no usable images for split {split!r}")
