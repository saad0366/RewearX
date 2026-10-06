import sys
import os
os.environ["HF_HOME"] = os.getenv("HF_HOME", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache", "huggingface"))

from flask import Flask, jsonify
from flask_cors import CORS
from flask_restx import Api, Resource, fields
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


from config import Config
from models.distilbert_loader import MiniLMLoader
from services.nlp_service import NLService
from services.occasion_extraction import extract_occasions
from services.similarity_service import SimilarityService

os.makedirs(Config.LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(Config.LOG_FILE),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ── Eager model warm-up ─────────────────────────────────────────────────────
# Load the model once at startup so the first HTTP request isn't slow.
# Also logs confirmed model name and embedding dimension for verification.
logger.info("=" * 60)
logger.info("ReWearX AI Service starting...")
logger.info(f"Configured model: {Config.MODEL_NAME}")
try:
    _loader = MiniLMLoader()
    _test   = _loader.embed_one("warm up")
    logger.info(f"Model loaded OK — embedding dimension: {len(_test)}")
except Exception as _e:
    logger.error(f"Model warm-up FAILED: {_e}")
logger.info("=" * 60)

def create_app():
    app = Flask(__name__)
    CORS(app)
    
    api = Api(
        app,
        version='4.0.0',
        title='ReWearX AI Service API',
        doc='/api/docs'
    )
    
    health_ns = api.namespace('health', description='Health check')
    
    @health_ns.route('/')
    class HealthCheck(Resource):
        def get(self):
            return {"status": "running"}
    
    query_ns = api.namespace('query', description='Dynamic query attribute extraction')
    
    attribute_item = query_ns.model('AttributeItem', {
        'name': fields.String(required=True),
        'description': fields.String()
    })

    query_request = query_ns.model('QueryRequest', {
        'query': fields.String(required=True),
        'categories': fields.List(fields.Raw),
        'colors': fields.List(fields.Raw),
        'conditions': fields.List(fields.Raw),
        'genders': fields.List(fields.Raw),
        'seasons': fields.List(fields.Raw),
        'occasions': fields.List(fields.Raw),
        'threshold': fields.Float(default=0.75)
    })
    
    @query_ns.route('/attributes')
    class QueryAttributesResource(Resource):
        @query_ns.expect(query_request, validate=True)
        @query_ns.response(200, 'Success')
        @query_ns.response(400, 'Validation Error')
        def post(self):
            data = query_ns.payload
            query = data['query']
            categories = data.get('categories', [])
            colors = data.get('colors', [])
            conditions = data.get('conditions', [])
            genders = data.get('genders', [])
            seasons = data.get('seasons', [])
            occasions = data.get('occasions', [])
            
            if not any([categories, colors, conditions, genders, seasons, occasions]):
                return {"error": "At least one attribute list required"}, 400
            
            nlp_service = NLService()
            result = {}
            
            threshold = data.get('threshold', 0.75)

            if categories:
                matches = nlp_service.match_attribute(query, categories)
                result['category'] = [{'name': m['name'], 'score': m['score']} for m in matches if m['score'] >= threshold]
            
            if colors:
                matches = nlp_service.match_attribute(query, colors)
                result['color'] = [{'name': m['name'], 'score': m['score']} for m in matches if m['score'] >= threshold]
            
            if conditions:
                matches = nlp_service.match_attribute(query, conditions)
                result['condition'] = [{'name': m['name'], 'score': m['score']} for m in matches if m['score'] >= threshold]
            
            if genders:
                matches = nlp_service.match_attribute(query, genders)
                result['gender'] = [{'name': m['name'], 'score': m['score']} for m in matches if m['score'] >= threshold]
            
            if seasons:
                matches = nlp_service.match_attribute(query, seasons)
                result['season'] = [{'name': m['name'], 'score': m['score']} for m in matches if m['score'] >= threshold]
            
            if occasions:
                result['occasion'] = extract_occasions(query, occasions)
            
            return result
    
    rank_ns = api.namespace('rank', description='Rank pre-filtered items')
    
    rank_request = rank_ns.model('RankRequest', {
        'query_embedding': fields.List(fields.Float, required=True),
        'items': fields.List(fields.Nested(rank_ns.model('RankItem', {
            'id': fields.Integer(required=True),
            'text': fields.String(required=True)
        })), required=True),
        'top_n': fields.Integer(required=False)
    })
    
    @rank_ns.route('/')
    class RankResource(Resource):
        @rank_ns.expect(rank_request, validate=True)
        @rank_ns.response(200, 'Success')
        @rank_ns.response(400, 'Validation Error')
        def post(self):
            data = rank_ns.payload
            query_embedding = data['query_embedding']
            items = data['items']
            top_n = data.get('top_n')
            
            similarity_service = SimilarityService()
            rankings = similarity_service.rank_items(query_embedding, items, top_n)
            
            return {"rankings": rankings}
    
    extract_ns = api.namespace('extract', description='Generate embedding')
    
    extract_request = extract_ns.model('ExtractRequest', {'text': fields.String(required=True)})
    
    @extract_ns.route('/')
    class ExtractResource(Resource):
        @extract_ns.expect(extract_request, validate=True)
        @extract_ns.response(200, 'Success')
        @extract_ns.response(400, 'Validation Error')
        def post(self):
            data = extract_ns.payload
            text = data['text']
            nlp_service = NLService()
            embedding = nlp_service.generate_embedding(text)
            return {"embedding": embedding, "dimensions": len(embedding)}
    
    similarity_ns = api.namespace('similarity', description='Compute similarity')
    
    similarity_request = similarity_ns.model('SimilarityRequest', {
        'query': fields.String(required=True),
        'items': fields.List(fields.Nested(similarity_ns.model('Item', {
            'id': fields.Integer(required=True),
            'text': fields.String(required=True)
        })), required=True)
    })
    
    @similarity_ns.route('/')
    class SimilarityResource(Resource):
        @similarity_ns.expect(similarity_request, validate=True)
        @similarity_ns.response(200, 'Success')
        @similarity_ns.response(400, 'Validation Error')
        def post(self):
            data = similarity_ns.payload
            query = data['query']
            items = data['items']
            similarity_service = SimilarityService()
            recommendations = similarity_service.compute_similarity(query, items)
            return {"recommendations": recommendations}
    
    from routes.health import health_bp
    from routes.extract import extract_bp
    from routes.similarity import similarity_bp
    from routes.recommendation import recommendation_bp
    
    app.register_blueprint(health_bp)
    app.register_blueprint(extract_bp)
    app.register_blueprint(similarity_bp)
    app.register_blueprint(recommendation_bp)
    
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "Not found"}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Internal server error: {error}")
        return jsonify({"error": "Internal server error"}), 500
    
    return app

app = create_app()

if __name__ == '__main__':
    logger.info("Starting AI Service with DistilBERT v4 (Dynamic - No Hardcoding)...")
    app.run(host=Config.HOST, port=Config.PORT, debug=False)
