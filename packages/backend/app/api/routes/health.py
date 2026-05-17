from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "VirtuosoVision Backend",
        "version": "1.0.0",
    }


@router.get("/ollama")
async def check_ollama_status():
    """Debug endpoint to check if Ollama is running"""
    from app.ml.ollama_wrapper import ollama_service

    is_healthy = await ollama_service.health_check()
    return {
        "ollama": {
            "status": "running" if is_healthy else "not_running",
            "url": ollama_service.base_url,
            "model": ollama_service.model,
        }
    }

