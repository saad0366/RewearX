"""Literal search intent; scores indicate explicit matches, not model probabilities."""
import re

SUPPORTED_OCCASIONS = ('casual', 'formal', 'party', 'wedding', 'sports')


def extract_occasions(query, values):
    offered = {
        str(v.get('name', '') if isinstance(v, dict) else v).strip().lower()
        for v in values
    }
    return [
        {'name': name, 'score': 1.0, 'source': 'explicit_keyword'}
        for name in SUPPORTED_OCCASIONS
        if name in offered and re.search(
            r'\b' + (r'sports(?:wear)?' if name == 'sports' else name) + r'\b',
            query, re.IGNORECASE)
    ]
