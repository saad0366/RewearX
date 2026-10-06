"""
Recommendation / Ranking Routes
=================================

POST /api/query/attributes  — attribute extraction for search filtering
POST /api/rank              — rank candidate items against a query embedding
POST /api/embed-item        — generate + return a single product embedding
                              (called by Node when a product is created/updated)
"""

from flask import Blueprint, request, jsonify
import logging

from models.distilbert_loader import MiniLMLoader
from services.nlp_service import NLService
from services.occasion_extraction import extract_occasions
from services.similarity_service import SimilarityService

logger = logging.getLogger(__name__)
recommendation_bp = Blueprint('recommendation', __name__)

# Module-level singletons — model never reloaded per request
_nlp = NLService()
_sim = SimilarityService()


# ─────────────────────────────────────────────────────────────────────────────
# Attribute extraction
# ─────────────────────────────────────────────────────────────────────────────

@recommendation_bp.route('/api/query/attributes', methods=['POST'])
def extract_query_attributes():
    """
    Extract structured attributes (category, gender, color, condition, occasion)
    from a natural-language query. Occasion uses explicit keywords only;
    existing attributes continue using semantic similarity.

    Only attributes that score above the given threshold are returned.
    For open/generic queries, this correctly returns empty lists, which
    tells the Node service NOT to apply structured WHERE-clause filters.
    """
    data = request.get_json()

    if not data or 'query' not in data:
        return jsonify({"error": "Missing 'query' field"}), 400

    query = data['query']
    if not query or not isinstance(query, str):
        return jsonify({"error": "Query must be a non-empty string"}), 400

    categories = data.get('categories', [])
    colors     = data.get('colors', [])
    conditions = data.get('conditions', [])
    genders    = data.get('genders', [])
    seasons    = data.get('seasons', [])
    occasions  = data.get('occasions', [])

    if not any([categories, colors, conditions, genders, seasons, occasions]):
        return jsonify({"error": "At least one attribute list required"}), 400

    threshold = float(data.get('threshold', 0.75))
    result = {}

    if categories:
        matches = _nlp.match_attribute(query, categories)
        # Return top-5 regardless of threshold so Node can inspect scores
        result['category'] = [
            {'name': m['name'], 'score': m['score']}
            for m in matches[:5]
        ]

    if colors:
        matches = _nlp.match_attribute(query, colors)
        result['color'] = [m for m in matches if m['score'] >= threshold]

    if conditions:
        matches = _nlp.match_attribute(query, conditions)
        result['condition'] = [m for m in matches if m['score'] >= threshold]

    if genders:
        matches = _nlp.match_attribute(query, genders)
        result['gender'] = [m for m in matches if m['score'] >= threshold]

    if seasons:
        matches = _nlp.match_attribute(query, seasons)
        result['season'] = [m for m in matches if m['score'] >= threshold]

    if occasions:
        result['occasion'] = extract_occasions(query, occasions)

    return jsonify(result)


# ─────────────────────────────────────────────────────────────────────────────
# Ranking
# ─────────────────────────────────────────────────────────────────────────────

@recommendation_bp.route('/api/rank', methods=['POST'])
def rank_items():
    """
    Rank candidate items against a pre-computed query embedding.

    Each item may include:
      "embedding": [float, ...]  — stored product embedding (fast path)
      "text":      str           — raw text to embed on-the-fly (fallback)

    Returns { "rankings": [{ "id": int, "score": float }, ...] }
    """
    data = request.get_json()

    if not data or 'query_embedding' not in data or 'items' not in data:
        return jsonify({"error": "Missing required fields: query_embedding, items"}), 400

    query_embedding = data['query_embedding']
    items           = data['items']
    top_n           = data.get('top_n')

    if not isinstance(query_embedding, list) or not items:
        return jsonify({"error": "Invalid input format"}), 400

    try:
        rankings = _sim.rank_items(query_embedding, items, top_n)
        return jsonify({"rankings": rankings})
    except Exception as e:
        logger.error(f"[RANK] Failed: {e}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# Product embedding generation  (Phase 5 — store embeddings)
# ─────────────────────────────────────────────────────────────────────────────

@recommendation_bp.route('/api/embed-item', methods=['POST'])
def embed_item():
    """
    Generate a MiniLM embedding for a single product's semantic text.

    Called by the Node.js server after a product is created or updated.
    The Node service stores the returned embedding in item_features.text_vector.

    Request body:
    {
      "semantic_text": "Title: ...\nCategory: ...\nDescription: ..."
    }

    Response:
    {
      "embedding": [float, ...],   // 384 floats, L2-normalised
      "dimensions": 384
    }
    """
    data = request.get_json()

    if not data or 'semantic_text' not in data:
        return jsonify({"error": "Missing 'semantic_text' field"}), 400

    text = data['semantic_text']
    if not text or not isinstance(text, str) or not text.strip():
        return jsonify({"error": "semantic_text must be a non-empty string"}), 400

    try:
        embedding = _nlp.generate_embedding(text.strip())
        return jsonify({"embedding": embedding, "dimensions": len(embedding)})
    except Exception as e:
        logger.error(f"[EMBED-ITEM] Failed: {e}")
        return jsonify({"error": str(e)}), 500