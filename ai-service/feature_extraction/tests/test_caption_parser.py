"""Deterministic caption rules and conservative conflict handling."""

import unittest

from feature_extraction.clothing_config import CLASS_NAMES
from feature_extraction.training.caption_parser import parse_caption


class CaptionParserTests(unittest.TestCase):
    def test_requested_examples(self):
        examples = [
            ("black gold embroidered salwar suit", {"color": ["black", "gold"], "pattern": "embroidered", "category": "shalwar_kameez"}),
            ("red floral full sleeve kurti", {"color": ["red"], "pattern": "floral", "sleeve_length": "full"}),
            ("blue and white striped shirt", {"color": ["white", "blue"], "pattern": "striped", "category": "shirt"}),
            ("green half sleeve kurta", {"color": ["green"], "sleeve_length": "half"}),
            ("gold earrings with stones", {"color": ["gold"], "category": "other_fashion"}),
            ("bridal red embroidered lehenga", {"color": ["red"], "pattern": "embroidered", "category": "lehenga", "occasion": "wedding"}),
            ("black leather handbag", {"color": ["black"], "category": "other_fashion"}),
            ("summer blue printed dress", {"color": ["blue"], "pattern": "printed", "category": "dress", "season": "summer"}),
        ]
        for caption, expected in examples:
            with self.subTest(caption=caption):
                result = parse_caption(caption)
                for head in CLASS_NAMES:
                    self.assertEqual(result["labels"][head], expected.get(head))
                    self.assertEqual(result["valid"][head], head in expected)

    def test_full_caption_matching_order_case_and_punctuation(self):
        a = parse_caption("A KURTI, beautifully EMBROIDERED in RED, with FULL-SLEEVED styling.")
        b = parse_caption("red full sleeved embroidered kurti")
        self.assertEqual(a["labels"], b["labels"])
        self.assertEqual(parse_caption("SHALWAR_KAMEEZ")['labels']['category'], "shalwar_kameez")

    def test_specific_phrases_do_not_create_false_conflicts(self):
        for caption, category, pattern in (("floral print t-shirt", "t_shirt", "floral"),
                                           ("flower print dress shirt", "shirt", "floral"),
                                           ("graphic print tee", "t_shirt", "printed")):
            result = parse_caption(caption)
            self.assertEqual(result["labels"]["category"], category)
            self.assertEqual(result["labels"]["pattern"], pattern)
            self.assertFalse(result["review_required"])

    def test_three_colors_stay_atomic_and_synonyms_explicit(self):
        self.assertEqual(parse_caption("black white gold shirt")["labels"]["color"], ["black", "white", "gold"])
        self.assertEqual(parse_caption("navy blue gray golden kurti")["labels"]["color"], ["grey", "blue", "gold"])
        result = parse_caption("black teal dress")
        self.assertIsNone(result["labels"]["color"])
        self.assertTrue(result["review_required"])

    def test_new_color_aliases(self):
        aliases = {"maroon": "red", "burgundy": "red", "lavender": "purple",
                   "cream": "beige", "ivory": "beige", "tan": "brown",
                   "mint": "green", "mustard": "yellow"}
        for alias, expected in aliases.items():
            with self.subTest(alias=alias):
                result = parse_caption(f"{alias} shirt")
                self.assertEqual(result["labels"]["color"], [expected])
                self.assertFalse(result["review_required"])
        self.assertEqual(parse_caption("black maroon dress")["labels"]["color"], ["black", "red"])
        self.assertEqual(parse_caption("cream embroidered salwar suit")["labels"]["color"], ["beige"])
        self.assertEqual(parse_caption("maroon burgundy red shirt")["labels"]["color"], ["red"])
        result = parse_caption("black teal dress")
        self.assertIsNone(result["labels"]["color"])
        self.assertIn("unmapped_color:teal", result["review_reasons"])

    def test_new_other_fashion_mappings(self):
        terms = ("dupatta", "abaya", "pajamas", "pyjamas", "boxer brief", "boxer briefs", "boxers",
                 "stole", "stoles", "blouse", "satchel", "handbag", "bag", "purse", "sandal", "sandals",
                 "shoe", "shoes", "heels", "earrings", "earring", "necklace", "ring", "bracelet", "bangle",
                 "watch", "wallet", "belt", "scarf", "sunglasses", "jewelry", "jewellery", "bedding",
                 "blanket", "place mat", "placemat", "foundation", "cosmetics", "makeup")
        for term in terms:
            with self.subTest(term=term):
                result = parse_caption(term)
                self.assertEqual(result["labels"]["category"], "other_fashion")
                self.assertEqual(sum(result["valid"].values()), 1)
                self.assertFalse(result["review_required"])

    def test_new_confident_examples_do_not_require_review(self):
        for caption, colors, pattern in (("black pink embroidered dupatta", ["black", "pink"], "embroidered"),
                                         ("brown leather sandal", ["brown"], None),
                                         ("white powder compact foundation", ["white"], None)):
            result = parse_caption(caption)
            self.assertEqual(result["labels"]["category"], "other_fashion")
            self.assertEqual(result["labels"]["color"], colors)
            self.assertEqual(result["labels"]["pattern"], pattern)
            self.assertFalse(result["review_required"])

    def test_generic_suit_kurta_and_tunic_remain_ambiguous(self):
        for caption in ("black suit", "kurta", "women's tunic", "tunic", "shirt and suit", "kurti tunic"):
            with self.subTest(caption=caption):
                result = parse_caption(caption)
                self.assertIsNone(result["labels"]["category"])
                self.assertTrue(result["review_required"])
        for caption in ("salwar suit", "shalwar suit", "salwar kameez", "shalwar kameez"):
            result = parse_caption(caption)
            self.assertEqual(result["labels"]["category"], "shalwar_kameez")
            self.assertFalse(result["review_required"])
        self.assertIsNone(parse_caption("salwar suit and another suit")["labels"]["category"])

    def test_conflicts_and_truncation_still_require_review(self):
        result = parse_caption("floral embroidered blouse")
        self.assertEqual(result["labels"]["category"], "other_fashion")
        self.assertIsNone(result["labels"]["pattern"])
        self.assertFalse(result["valid"]["pattern"])
        self.assertTrue(result["review_required"])
        self.assertIsNone(parse_caption("shirt and dupatta")["labels"]["category"])
        for caption in ("red blouse...", "red blouse with", "red blouse…"):
            self.assertIn("possibly_truncated_caption", parse_caption(caption)["review_reasons"])
        self.assertIn("zero_usable_labels", parse_caption("unidentified item")["review_reasons"])

    def test_no_implicit_sleeve_season_or_occasion(self):
        for caption in ("t-shirt", "kurti", "lehenga", "jacket", "sweater", "shirt"):
            result = parse_caption(caption)
            for head in ("sleeve_length", "season", "occasion"):
                self.assertIsNone(result["labels"][head])

    def test_all_sleeve_variants(self):
        for phrase, label in (("no sleeves", "sleeveless"), ("short-sleeved", "short"),
                              ("half sleeves", "half"), ("3/4 sleeves", "three_quarter"),
                              ("three-quarter sleeve", "three_quarter"), ("long-sleeved", "full")):
            result = parse_caption(f"{phrase} black kurti")
            self.assertEqual(result["labels"]["sleeve_length"], label)
            self.assertEqual(result["labels"]["color"], ["black"])

    def test_conflicts_only_mask_affected_heads(self):
        result = parse_caption("black embroidered floral shirt and trousers")
        self.assertIsNone(result["labels"]["category"])
        self.assertIsNone(result["labels"]["pattern"])
        self.assertEqual(result["labels"]["color"], ["black"])
        self.assertTrue(result["review_required"])
        self.assertEqual(len(result["evidence"]["category"]), 2)

    def test_repeated_synonyms_are_not_conflicts(self):
        result = parse_caption("embroidered shirt with embroidery")
        self.assertEqual(result["labels"]["pattern"], "embroidered")
        self.assertFalse(result["review_required"])

    def test_kurta_is_explicitly_qualified_or_reviewed(self):
        self.assertIsNone(parse_caption("green half sleeve kurta")["labels"]["category"])
        self.assertIn("ambiguous_kurta", parse_caption("kurta")["review_reasons"])
        for caption in ("women's kurta", "kurti", "kurtis", "kurti shirt"):
            result = parse_caption(caption)
            self.assertIsNone(result["labels"]["category"])
            self.assertFalse(result["valid"]["category"])
            self.assertTrue(result["review_required"])

    def test_accessories_preserved_without_guessed_heads(self):
        for accessory in ("earrings", "necklace", "rings", "bracelet", "bangles", "handbag", "purse",
                          "shoes", "sandals", "heels", "watch", "wallet", "belt", "scarf", "sunglasses", "jewellery"):
            result = parse_caption(accessory)
            self.assertEqual(result["labels"]["category"], "other_fashion")
            self.assertEqual(sum(result["valid"].values()), 1)

    def test_strong_occasion_and_season(self):
        for caption, head, label in (("party wear kurti", "occasion", "party"),
                                     ("gym wear shirt", "occasion", "sports"),
                                     ("formal shirt", "occasion", "formal"),
                                     ("casual dress", "occasion", "casual"),
                                     ("winter collection jacket", "season", "winter"),
                                     ("year-round shirt", "season", "all_season")):
            self.assertEqual(parse_caption(caption)["labels"][head], label)

    def test_weak_negated_and_suspicious_text(self):
        for caption in (None, "", "https://example.test red shirt", "<b>red shirt</b>"):
            result = parse_caption(caption)
            self.assertTrue(result["review_required"])
            self.assertFalse(any(result["valid"].values()))
        self.assertIsNone(parse_caption("shirt without embroidery")["labels"]["pattern"])
        self.assertIsNone(parse_caption("shirt red or blue")["labels"]["color"])
        self.assertIsNone(parse_caption("print this page for the shirt")["labels"]["pattern"])
        self.assertIsNone(parse_caption("solid gold ring")["labels"]["pattern"])
        self.assertIsNone(parse_caption("red saree")["labels"]["category"])


if __name__ == "__main__":
    unittest.main()
