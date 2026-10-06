"""Read-only DeepFashion Category + Attribute annotations; no ML dependencies."""

from pathlib import Path, PurePosixPath
import re

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES

ADAPTER_VERSION = "deepfashion_attribute_v1"
CATEGORY_MAP = {
    "Hoodie": "hoodie", "Jacket": "jacket", "Sweater": "sweater",
    "Tee": "t_shirt", "Jeans": "jeans", "Skirt": "skirt",
    "Blouse": "shirt", "Button-Down": "shirt",
    "Chinos": "trousers", "Joggers": "trousers", "Sweatpants": "trousers",
    "Dress": "dress", "Shirtdress": "dress", "Sundress": "dress",
}


def annotation_lines(path, header):
    """Stream counted, headered official text files, validating declared count."""
    path = Path(path)
    with path.open(encoding="utf-8-sig") as stream:
        try:
            declared = int(stream.readline().strip())
        except ValueError as exc:
            raise ValueError(f"{path}: invalid declared count") from exc
        if declared < 0 or stream.readline().split() != header.split():
            raise ValueError(f"{path}: invalid count/header")
        actual = 0
        for number, line in enumerate(stream, 3):
            if not line.strip():
                raise ValueError(f"{path}:{number}: blank annotation row")
            actual += 1
            yield number, line.strip()
        if actual != declared:
            raise ValueError(f"{path}: declared {declared} rows, found {actual}")


def read_vocabulary(path, kind):
    if kind not in ("attribute", "category"):
        raise ValueError("Vocabulary kind must be attribute or category")
    rows, seen = [], set()
    for number, line in annotation_lines(path, f"{kind}_name {kind}_type"):
        parts = line.rsplit(None, 1)
        if len(parts) != 2 or parts[1] not in ({"1", "2", "3"} if kind == "category" else {"1", "2", "3", "4", "5"}):
            raise ValueError(f"{path}:{number}: invalid vocabulary row")
        name, type_id = parts
        if name in seen:
            raise ValueError(f"{path}:{number}: duplicate vocabulary name {name}")
        seen.add(name)
        rows.append({"name": name, "type": int(type_id)})
    if not rows:
        raise ValueError(f"{path}: empty vocabulary")
    return rows


def image_name(value):
    # Official identifiers are relative POSIX paths rooted in img/.
    path = PurePosixPath(value)
    if ("\\" in value or ":" in value or path.is_absolute() or ".." in path.parts
            or not path.parts or path.parts[0] != "img" or len(path.parts) < 2):
        raise ValueError(f"Unsafe/nonofficial image name: {value}")
    return path.as_posix()


def read_image_labels(path, kind, category_count=None):
    header = "image_name category_label" if kind == "category" else "image_name evaluation_status"
    result = {}
    for number, line in annotation_lines(path, header):
        parts = line.split()
        if len(parts) != 2:
            raise ValueError(f"{path}:{number}: expected image and label")
        name = image_name(parts[0])
        if name in result:
            raise ValueError(f"{path}:{number}: duplicate image {name}")
        if kind == "category":
            try:
                label = int(parts[1])
            except ValueError as exc:
                raise ValueError(f"{path}:{number}: invalid category ID") from exc
            if not 1 <= label <= category_count:
                raise ValueError(f"{path}:{number}: category ID outside vocabulary")
        else:
            label = parts[1]
            if label not in ("train", "val", "test"):
                raise ValueError(f"{path}:{number}: invalid official split")
        result[name] = label
    return result


def map_attribute(name):
    text = re.sub(r"[-\s]+", " ", name.casefold()).strip()
    sleeve = "sleeveless" if text == "sleeveless" else "full" if text in ("long sleeve", "long sleeved") else None
    tokens = set(text.split())
    patterns = set()
    if tokens & {"checked", "checkered", "plaid"}:
        patterns.add("checked")
    if tokens & {"stripe", "striped", "stripes", "pinstripe", "pinstriped", "pinstripes"}:
        patterns.add("striped")
    if "floral" in tokens:
        patterns.add("floral")
    if tokens & {"embroidered", "embroidery"}:
        patterns.add("embroidered")
    # 'Floral print' describes a specific pattern, not two competing patterns.
    # A separate positive generic print attribute is still a conflicting class.
    if tokens & {"print", "printed"} and not patterns:
        patterns.add("printed")
    if text == "solid":
        patterns.add("plain")
    return {"sleeve_length": sleeve, "pattern": sorted(patterns)}


class DeepFashionAttributeAdapter:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.annotation_root = self.root / "Anno_coarse"
        self.attributes = read_vocabulary(self.annotation_root / "list_attr_cloth.txt", "attribute")
        self.categories = read_vocabulary(self.annotation_root / "list_category_cloth.txt", "category")
        self.attribute_mappings = [map_attribute(row["name"]) for row in self.attributes]
        self.category_labels = read_image_labels(self.annotation_root / "list_category_img.txt", "category", len(self.categories))
        partition = self.root / "Eval" / "list_eval_partition.txt"
        self.partitions = read_image_labels(partition, "partition") if partition.is_file() else None
        if self.partitions is not None and self.partitions.keys() != self.category_labels.keys():
            raise ValueError("Category and official partition image sets differ")
        if set(CATEGORY_MAP.values()) - set(CLASS_NAMES["category"]):
            raise ValueError("Adapter mappings do not match current taxonomy")

    def __iter__(self):
        seen = set()
        path = self.annotation_root / "list_attr_img.txt"
        for number, line in annotation_lines(path, "image_name attribute_labels"):
            parts = line.split()
            name = image_name(parts[0])
            values = parts[1:]
            if len(values) != len(self.attributes) or any(value not in ("-1", "0", "1") for value in values):
                raise ValueError(f"{path}:{number}: invalid attribute vector length/value")
            if name in seen or name not in self.category_labels:
                raise ValueError(f"{path}:{number}: duplicate image or missing category annotation: {name}")
            seen.add(name)
            category_name = self.categories[self.category_labels[name] - 1]["name"]
            labels = dict.fromkeys(HEAD_NAMES)
            labels["category"] = CATEGORY_MAP.get(category_name)
            candidates = {"sleeve_length": set(), "pattern": set()}
            evidence = {"sleeve_length": [], "pattern": []}
            for i, value in enumerate(values):
                if value != "1":
                    continue
                mapping = self.attribute_mappings[i]
                for head in candidates:
                    mapped = mapping[head]
                    if mapped:
                        candidates[head].update([mapped] if isinstance(mapped, str) else mapped)
                        evidence[head].append(self.attributes[i]["name"])
            reasons = []
            if labels["category"] is None:
                reasons.append("unsupported_category:" + category_name)
            for head, matches in candidates.items():
                if len(matches) == 1:
                    labels[head] = next(iter(matches))
                elif len(matches) > 1:
                    reasons.append("conflicting_" + head)
            if not any(value is not None for value in labels.values()):
                reasons.append("zero_usable_labels")
            if self.partitions is None:
                reasons.append("official_partition_unavailable")
            yield {"image_name": name, "image_path": self.root / name,
                   "split": self.partitions[name] if self.partitions is not None else "unassigned",
                   "source_category": category_name, "labels": labels,
                   "valid": {head: labels[head] is not None for head in HEAD_NAMES},
                   "evidence": evidence, "review_required": bool(reasons), "review_reasons": reasons}
        if seen != self.category_labels.keys():
            raise ValueError("Attribute and category annotation image sets differ")
