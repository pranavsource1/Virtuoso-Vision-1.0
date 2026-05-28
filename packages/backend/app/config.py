from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # ============ FastAPI ============
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    DEBUG: bool = False
    FRONTEND_URL: str = "http://localhost:3000"

    # ============ Database ============
    MONGODB_URL: str
    MONGODB_DB: str = "virtuosovision"

    # ============ Cache & Message Queue ============
    REDIS_URL: str
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    # ============ Authentication ============
    FIREBASE_PROJECT_ID: Optional[str] = None
    FIREBASE_PRIVATE_KEY: Optional[str] = None
    FIREBASE_CLIENT_EMAIL: Optional[str] = None
    FIREBASE_CLIENT_ID: Optional[str] = None

    # ============ Storage & Embeddings ============
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_EMBEDDINGS_TABLE: str = "song_embeddings"

    # ============ AI & ML ============
    OPENAI_API_KEY: Optional[str] = None
    HUGGINGFACE_API_KEY: Optional[str] = None
    OLLAMA_API_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "mistral"

    # ============ Media Processing ============
    YOUTUBE_API_ENABLED: bool = True
    MAX_UPLOAD_SIZE: int = 500 * 1024 * 1024  # 500 MB
    MEDIA_DIR: str = "media"
    PUBLIC_API_URL: str = "http://localhost:8000"
    LOCAL_STORAGE_DIR: Optional[str] = None
    LOCAL_STORAGE_URL: Optional[str] = None

    # ============ Notifications & Webhooks ============
    N8N_WEBHOOK_URL: Optional[str] = None
    NOTIFICATION_EMAIL: str = "noreply@virtuosovision.com"

    class Config:
        env_file = ".env"
        case_sensitive = True


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get application settings (singleton pattern)"""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
