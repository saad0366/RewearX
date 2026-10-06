"""
NLP Service — MiniLM semantic embeddings
==========================================
All embedding work goes through MiniLMLoader which uses the
SentenceTransformer API. This guarantees:

  - The same model encodes queries AND product text
  - Mean-pooling + L2-normalisation is done by the library
  - Cosine similarity = dot product on the normalised vectors
  - 384-dimensional output for all-MiniLM-L6-v2
"""

from typing import List, Dict, Any
import numpy as np
import logging

from models.distilbert_loader import MiniLMLoader

logger = logging.getLogger(__name__)


class NLService:
    def __init__(self):
        self.loader = MiniLMLoader()

    # ------------------------------------------------------------------ #
    #  Public: single embedding                                            #
    # ------------------------------------------------------------------ #
    def generate_embedding(self, text: str) -> List[float]:
        """Encode one text string → 384-dim normalised float list."""
        if not text or not isinstance(text, str):
            raise ValueError("Text must be a non-empty string")
        return self.loader.embed_one(text.strip())

    # ------------------------------------------------------------------ #
    #  Public: batch embeddings                                            #
    # ------------------------------------------------------------------ #
    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Encode a list of texts → list of 384-dim normalised float lists."""
        if not texts:
            return []
        cleaned = [t.strip() if t else "" for t in texts]
        return self.loader.embed(cleaned)

    # ------------------------------------------------------------------ #
    #  Public: attribute matching (for /api/query/attributes)             #
    # ------------------------------------------------------------------ #
    def match_attribute(
        self,
        query: str,
        values: List[Dict[str, str]],
    ) -> List[Dict[str, Any]]:
        """
        Compute cosine similarity between the query embedding and each
        attribute description embedding.

        Returns a list sorted by score descending, each item being:
          { "name": str, "score": float }
        """
        if not query or not isinstance(query, str):
            return []
        if not values or not isinstance(values, list):
            return []

        try:
            # Build texts to embed for each attribute option
            texts_to_embed = []
            item_names = []

            for item in values:
                if isinstance(item, dict):
                    desc = item.get("description", "")
                    name = item.get("name", "")
                    text = f"{name} - {desc}" if desc and desc != name else name
                else:
                    text = str(item)
                    name = text
                texts_to_embed.append(text)
                item_names.append(name)

            # Embed query and all attribute texts in one batch
            all_texts = [query.strip()] + texts_to_embed
            all_embeddings = self.loader.embed(all_texts)

            query_vec = np.array(all_embeddings[0])
            attr_vecs = np.array(all_embeddings[1:])

            # Cosine sim = dot product because vectors are L2-normalised
            scores = attr_vecs.dot(query_vec)

            results = [
                {"name": name, "score": float(scores[i])}
                for i, name in enumerate(item_names)
            ]
            results.sort(key=lambda x: x["score"], reverse=True)
            return results

        except Exception as e:
            logger.error(f"match_attribute failed: {e}")
            raise RuntimeError(f"match_attribute failed: {e}")
