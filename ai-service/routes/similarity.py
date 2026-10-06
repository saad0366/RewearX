"""
Similarity Route
================

POST /api/similarity

Direct similarity endpoint: accepts a raw query string and candidate items,
returns each item ranked by cosine similarity to the query.

Unlike /api/rank (which requires a pre-computed query embedding),
this endpoint embeds the query internally and is useful for ad-hoc
comparisons without a separate /api/extract call.

Request body (JSON)
-------------------
{
  "query": "casual summer dress",
  "items": [
    {"id": 1, "text": "floral cotton dress size M..."},
    {"id": 2, "text": "heavy winter jacket..."}
  ]
}

Response (200 OK)
-----------------
{
  "success":         true,
  "recommendations": [
    {"id": 1, "score": 0.87, "semantic_score": 0.87},
    {"id": 2, "score": 0.29, "semantic_score": 0.29}
  ]
}
Sorted by score descending.
"""

import logging
from flask import Blueprint, request, jsonify

from services.similarity_service import SimilarityService

logger = logging.getLogger(__name__)
similarity_bp = Blueprint("similarity", __name__)

# Module-level singleton — model never reloaded per request
_sim = SimilarityService()


@similarity_bp.route("/api/similarity", methods=["POST"])
def compute_similarity():
    """
    POST /api/similarity
    Embed query text and rank candidate items by cosine similarity.
    """
    data = request.get_json(silent=True)

    if not data or "query" not in data or "items" not in data:
        return (
            jsonify({"success": False, "message": "Missing required fields: query, items."}),
            400,
        )

    query = data.get("query", "")
    items = data.get("items", [])

    if not query or not isinstance(query, str) or not query.strip():
        return (
            jsonify({"success": False, "message": "Query must be a non-empty string."}),
            400,
        )

    if not isinstance(items, list):
        return (
            jsonify({"success": False, "message": "Items must be a JSON array."}),
            400,
        )

    if not items:
        return jsonify({"success": True, "recommendations": []}), 200

    try:
        recommendations = _sim.compute_similarity(query.strip(), items)
        return jsonify({"success": True, "recommendations": recommendations}), 200

    except Exception as exc:
        logger.error(f"[SIMILARITY] compute_similarity failed: {exc}")
        return (
            jsonify({"success": False, "message": "Similarity computation failed.", "error": str(exc)}),
            500,
        )
