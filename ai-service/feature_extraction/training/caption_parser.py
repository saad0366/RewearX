"""Conservative deterministic caption rules. No model, network, or inference imports."""

import re
import unicodedata

from feature_extraction.clothing_config import CLASS_NAMES, HEAD_NAMES

PARSER_VERSION = "pakistani_caption_v3"


def normalize_caption(caption):
    text = unicodedata.normalize("NFKC", caption).casefold()
    text = re.sub(r"[‐‑‒–—−_-]", " ", text)
    text = text.replace("’", "'")
    return re.sub(r"\s+", " ", text).strip()


# Values always resolve through the existing taxonomy; these do not define classes.
RULES = {
    "category": {
        "shalwar_kameez": ("salwar kameez", "shalwar kameez", "salwar suit", "shalwar suit"),
        "lehenga": ("lehenga", "lehngas", "lehnga", "lehengas"),
        "t_shirt": ("t shirt", "t shirts", "tee", "tees"),
        "shirt": ("dress shirt", "shirt", "shirts"), "hoodie": ("hoodie", "hoodies"),
        "sweater": ("sweater", "sweaters"), "jacket": ("jacket", "jackets"),
        "jeans": ("denim jeans", "jeans"), "trousers": ("trousers", "pants"),
        "dress": ("dress", "dresses"),
        "other_fashion": ("earrings", "earring", "necklace", "necklaces", "ring", "rings",
                          "bracelet", "bracelets", "bangle", "bangles", "handbag", "handbags",
                          "bag", "bags", "purse", "purses", "shoe", "shoes", "sandals", "heels",
                          "watch", "watches", "wallet", "wallets", "belt", "belts", "scarf",
                          "scarves", "sunglasses", "jewelry", "jewellery",
                          "dupatta", "dupattas", "abaya", "abayas", "pajamas", "pyjamas",
                          "boxer brief", "boxer briefs", "boxers", "stole", "stoles",
                          "blouse", "blouses", "satchel", "satchels", "sandal",
                          "bedding", "blanket", "blankets", "place mat", "place mats",
                          "placemat", "placemats", "foundation", "cosmetics", "makeup"),
    },
    "pattern": {
        "embroidered": ("embroidered", "embroidery", "embellished with embroidery"),
        "floral": ("floral", "floral print", "floral printed", "printed floral", "flower print", "flower pattern"),
        "striped": ("striped", "stripes", "stripe", "striped print", "stripe print"),
        "checked": ("checked", "checkered", "plaid", "checked print", "checkered print", "plaid print"),
        "printed": ("printed", "print", "graphic", "graphic print"),
        "plain": ("plain", "solid", "solid color", "solid colour"),
    },
    "sleeve_length": {
        "sleeveless": ("sleeveless", "no sleeves"),
        "short": ("short sleeve", "short sleeves", "short sleeved"),
        "half": ("half sleeve", "half sleeves", "half sleeved"),
        "three_quarter": ("three quarter sleeve", "three quarter sleeves", "three quarter sleeved",
                          "3/4 sleeve", "3/4 sleeves", "3/4 sleeved"),
        "full": ("full sleeve", "full sleeves", "full sleeved", "long sleeve", "long sleeves", "long sleeved"),
    },
    "occasion": {
        "wedding": ("bridal", "wedding wear", "wedding outfit", "wedding dress"),
        "party": ("party wear", "party dress", "party outfit"),
        "sports": ("sportswear", "activewear", "gym wear", "athletic wear"),
        "formal": ("formal wear", "formal shirt", "formal dress"),
        "casual": ("casual wear", "casual shirt", "casual dress"),
    },
    "season": {
        "summer": ("summer", "summer wear", "summer collection", "summer dress"),
        "winter": ("winter", "winter wear", "winter collection", "winter jacket"),
        "all_season": ("all season", "year round"),
    },
}
RULES["color"] = {color: (color,) for color in CLASS_NAMES["color"]}
RULES["color"].update(blue=("blue", "navy", "navy blue"), grey=("grey", "gray"),
                      gold=("gold", "golden"), red=("red", "maroon", "burgundy"),
                      purple=("purple", "lavender"), beige=("beige", "cream", "ivory"),
                      brown=("brown", "tan"), green=("green", "mint"),
                      yellow=("yellow", "mustard"))

for _head, _rules in RULES.items():
    if set(_rules) - set(CLASS_NAMES[_head]):
        raise ValueError(f"Parser rules are outside the current {_head} taxonomy")


def _matches(text, rules):
    candidates = []
    for label, phrases in rules.items():
        for phrase in phrases:
            for match in re.finditer(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text):
                candidates.append({"label": label, "phrase": phrase, "start": match.start(), "end": match.end()})
    # A t-shirt must not also become shirt; flower print must not also become print.
    selected = []
    for item in sorted(candidates, key=lambda m: (-(m["end"] - m["start"]), m["start"], m["label"])):
        if not any(item["start"] < other["end"] and other["start"] < item["end"] for other in selected):
            selected.append(item)
    return sorted(selected, key=lambda m: m["start"])


def parse_caption(caption):
    labels = {head: None for head in HEAD_NAMES}
    evidence = {head: [] for head in HEAD_NAMES}
    reasons = []
    if not isinstance(caption, str) or not caption.strip():
        return _result(labels, evidence, "", ["missing_or_nontext_caption"])
    text = normalize_caption(caption)
    if len(text) > 10000 or re.search(r"https?://|<[^>]+>", text):
        return _result(labels, evidence, text, ["suspicious_caption"])
    blocked = set()
    for head in HEAD_NAMES:
        evidence[head] = _matches(text, RULES[head])
        for match in evidence[head]:
            prefix = re.split(r"[.;!?]", text[:match["start"]])[-1]
            prefix = re.sub(r"\bno sleeves\b", "sleeveless", prefix)
            if re.search(r"\b(?:not|without|no|non)\b(?:\W+\w+){0,3}\W*$", prefix):
                blocked.add(head)
                reasons.append(f"negated_{head}")
        candidates = {m["label"] for m in evidence[head]}
        if head == "color":
            labels[head] = [c for c in CLASS_NAMES[head] if c in candidates] or None
        elif len(candidates) == 1:
            labels[head] = next(iter(candidates))
        elif len(candidates) > 1:
            reasons.append(f"conflicting_{head}:" + "|".join(sorted(candidates)))
    # Kurta remains unresolved; the retired kurti label must never become skirt.
    if re.search(r"\bkurta\b", text) and not any("kurta" in m["phrase"] for m in evidence["category"]):
        blocked.add("category")
        reasons.append("ambiguous_kurta")
    # Only qualified suit phrases may resolve the generic suit token.
    for match in re.finditer(r"\bsuits?\b", text):
        if not any(m["label"] == "shalwar_kameez" and m["start"] <= match.start()
                   and m["end"] >= match.end() for m in evidence["category"]):
            blocked.add("category")
            reasons.append("ambiguous_suit")
    # Women's tunic alone does not establish equivalence to a kurti.
    if re.search(r"\btunics?\b", text):
        blocked.add("category")
        reasons.append("ambiguous_tunic")
    if re.search(r"(?:\.\.\.|\b(?:and|with|in|of|or))\s*$", text):
        reasons.append("possibly_truncated_caption")
    unknown_categories = re.findall(r"\b(?:kurti|kurtis|sari|saree|gown|anarkali|jumpsuit)\b", text)
    if unknown_categories:
        blocked.add("category")
        reasons.append("unmapped_category:" + "|".join(sorted(set(unknown_categories))))
    unknown_colors = re.findall(r"\b(?:teal|turquoise|orange|silver|peach|magenta|multicolou?r(?:ed)?)\b", text)
    if unknown_colors:
        blocked.add("color")
        reasons.append("unmapped_color:" + "|".join(sorted(set(unknown_colors))))
    if re.search(r"\b(?:or|available in|choice of|choose from|various colors|various colours)\b", text):
        for head in HEAD_NAMES:
            if evidence[head]:
                blocked.add(head)
        reasons.append("alternative_or_variant_description")
    if re.search(r"\b(?:print (?:this|the page|on demand|out)|fine print|graphic design|printed (?:receipt|invoice|page))\b", text):
        blocked.add("pattern")
        reasons.append("unrelated_print_context")
    if re.search(r"\b(?:cap sleeves?|bell sleeves?|puff sleeves?)\b", text):
        blocked.add("sleeve_length")
        reasons.append("unmapped_sleeve_phrase")
    if re.search(r"\b(?:polka dots?|sequins?|lace)\b", text):
        blocked.add("pattern")
        reasons.append("unmapped_pattern_phrase")
    if re.search(r"\bsolid (?:gold|silver|metal)\b", text):
        blocked.add("pattern")
        reasons.append("solid_material_not_pattern")
    for head in blocked:
        labels[head] = None
    if labels["category"] is None and not any("category" in r or "kurta" in r for r in reasons):
        reasons.append("category_not_identified")
    if not any(value is not None for value in labels.values()):
        reasons.append("zero_usable_labels")
    return _result(labels, evidence, text, reasons)


def _result(labels, evidence, normalized, reasons):
    return {"labels": labels, "valid": {h: labels[h] is not None for h in HEAD_NAMES},
            "normalized_caption": normalized, "evidence": evidence,
            "review_required": bool(reasons), "review_reasons": sorted(set(reasons)),
            "parser_version": PARSER_VERSION}
