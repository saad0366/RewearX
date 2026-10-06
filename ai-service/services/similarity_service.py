"""
Similarity / Ranking Service
==============================
Ranks a list of candidate items against a pre-computed query embedding.

Two modes:
  A. Stored embedding mode  (fast, production)
     Item dict contains "embedding": [float, ...]
     → dot-product against query embedding (both L2-normalised)

  B. Dynamic embedding mode  (fallback)
     Item dict contains "text": str
     → encode items with MiniLM then dot-product

Both modes use the same MiniLMLoader so there is no cross-model
contamination between query and product vectors.
"""

from typing import List, Dict, Any, Optional
import numpy as np
import logging

from models.distilbert_loader import MiniLMLoader

logger = logging.getLogger(__name__)


class SimilarityService:
    def __init__(self):
        self.loader = MiniLMLoader()

    # ------------------------------------------------------------------ #
    #  rank_items                                                          #
    # ------------------------------------------------------------------ #
    def rank_items(
        self,
        query_embedding: List[float],
        items: List[Dict[str, Any]],
        top_n: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Rank items by cosine similarity to the query embedding.

        Each item must have either:
          "embedding": List[float]  — pre-computed product embedding (preferred)
          "text":      str          — raw text to embed on the fly

        Returns list of { "id": int/str, "score": float } sorted descending.
        """
        if not items:
            return []

        query_vec = np.array(query_embedding, dtype=np.float32)

        # Separate items that already have a stored embedding from those that don't
        stored_items   = [it for it in items if it.get("embedding")]
        dynamic_items  = [it for it in items if not it.get("embedding")]

        results = []

        # --- Stored embeddings (fast path) ---
        if stored_items:
            stored_vecs = np.array(
                [it["embedding"] for it in stored_items], dtype=np.float32
            )
            scores = stored_vecs.dot(query_vec)
            for it, score in zip(stored_items, scores):
                results.append({"id": it["id"], "score": float(score)})

        # --- Dynamic embeddings (fallback path) ---
        if dynamic_items:
            texts = [it.get("text", "") for it in dynamic_items]
            embeddings = self.loader.embed(texts)
            dyn_vecs = np.array(embeddings, dtype=np.float32)
            scores = dyn_vecs.dot(query_vec)
            for it, score in zip(dynamic_items, scores):
                results.append({"id": it["id"], "score": float(score)})

        results.sort(key=lambda x: x["score"], reverse=True)
        if top_n is not None:
            results = results[:top_n]
        return results

    # ------------------------------------------------------------------ #
    #  compute_similarity  (used by /api/similarity blueprint)            #
    # ------------------------------------------------------------------ #
    def compute_similarity(
        self,
        query: str,
        items: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Embed the query string, then rank items by cosine similarity.
        Same as rank_items but accepts a raw query string instead of a
        pre-computed embedding.
        """
        if not items:
            return []

        query_vec = np.array(self.loader.embed_one(query.strip()), dtype=np.float32)

        texts = [it.get("text", "") for it in items]
        item_vecs = np.array(self.loader.embed(texts), dtype=np.float32)
        scores = item_vecs.dot(query_vec)

        results = [
            {"id": it.get("id"), "score": float(scores[i]), "semantic_score": float(scores[i])}
            for i, it in enumerate(items)
        ]
        results.sort(key=lambda x: x["score"], reverse=True)
        return results
