import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Application configuration."""

    # Model — must be the sentence-similarity model, not a masked LM
    MODEL_NAME = os.getenv("MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
    TOP_RESULTS = int(os.getenv("TOP_RESULTS", "10"))

    # all-MiniLM-L6-v2 produces 384-dimensional embeddings
    EMBEDDING_DIM = 384
    MAX_LENGTH = 256

    # Server
    PORT = int(os.getenv("PORT", "5000"))
    HOST = os.getenv("HOST", "0.0.0.0")

    # Logging
    LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    LOG_FILE = os.path.join(LOG_DIR, "ai_service.log")
