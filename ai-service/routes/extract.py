"""
Extract Route
==============
POST /api/extract  — encode a single text string into a MiniLM embedding.

Used by the Node nlpSearchService to get the query embedding at search time.
"""

from flask import Blueprint, request, jsonify
import logging

from services.nlp_service import NLService

logger = logging.getLogger(__name__)
extract_bp = Blueprint('extract', __name__)

# Singleton — shares the same loaded model
_nlp = NLService()


@extract_bp.route('/api/extract', methods=['POST'])
def extract_embedding():
    data = request.get_json()

    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' field"}), 400

    text = data['text']
    if not text or not isinstance(text, str) or not text.strip():
        return jsonify({"error": "text must be a non-empty string"}), 400

    try:
        embedding = _nlp.generate_embedding(text.strip())
        return jsonify({"embedding": embedding, "dimensions": len(embedding)})
    except Exception as e:
        logger.error(f"[EXTRACT] Failed: {e}")
        return jsonify({"error": str(e)}), 500
