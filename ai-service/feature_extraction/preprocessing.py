"""Deterministic preprocessing matched to the official EfficientNet-B0 weights."""

from io import BytesIO

from PIL import Image, ImageOps
from torchvision.models import EfficientNet_B0_Weights

# Creating the transform does not download model weights.
_transform = EfficientNet_B0_Weights.IMAGENET1K_V1.transforms()


def preprocess_image(image):
    """Convert a PIL image to normalized float32 [3, 224, 224].

    Correct EXIF orientation, convert to RGB, resize the shorter edge to 256
    with bicubic interpolation, center-crop to 224, scale to [0, 1], then
    normalize with the ImageNet mean and standard deviation.
    """
    if not isinstance(image, Image.Image):
        raise TypeError("Expected a PIL.Image.Image.")
    image = ImageOps.exif_transpose(image).convert("RGB")
    return _transform(image)


def preprocess_image_bytes(image_bytes):
    """Decode encoded image bytes; invalid/unsafe images raise Pillow errors.

    Returns one image tensor; use unsqueeze(0) for a single-image batch.
    No filesystem writes or network requests are performed.
    """
    if not isinstance(image_bytes, (bytes, bytearray)) or not image_bytes:
        raise ValueError("Expected non-empty encoded image bytes.")
    with Image.open(BytesIO(image_bytes)) as image:
        return preprocess_image(image)
