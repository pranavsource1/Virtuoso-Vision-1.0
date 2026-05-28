from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from app.config import get_settings
from app.services.mongodb_service import mongodb_service
from app.services.firebase_service import firebase_service
from app.services.supabase_service import supabase_service
from app.services.embeddings_service import embeddings_service
from app.ml.ollama_wrapper import ollama_service
from app.api.routes import auth, songs, visions, health, embeddings, generation

settings = get_settings()
os.makedirs(settings.MEDIA_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    print("🚀 Starting VirtuosoVision Backend...")
    await mongodb_service.connect()
    firebase_service.initialize()
    supabase_service.initialize()
    embeddings_service.initialize()

    # Initialize Ollama
    print("📥 Initializing Ollama...")
    if await ollama_service.health_check():
        await ollama_service.ensure_model("mistral")
    else:
        print("⚠️  Ollama not available - using fallback mode")

    print("✅ All services initialized")
    yield
    # Shutdown
    print("🛑 Shutting down...")
    await mongodb_service.disconnect()
    print("✅ Shutdown complete")


app = FastAPI(
    title="VirtuosoVision API",
    description="Transform music into interactive 3D worlds",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(songs.router)
app.include_router(visions.router)
app.include_router(embeddings.router)
app.include_router(generation.router)
app.mount("/media", StaticFiles(directory=settings.MEDIA_DIR), name="media")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to VirtuosoVision API",
        "version": "1.0.0",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.HOST, port=settings.PORT, workers=settings.WORKERS)
