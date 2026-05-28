"""API routes for 3D music visualization generation (Local/Open-source)."""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Optional, Dict, Any
import uuid
from datetime import datetime
import tempfile

from app.services.mongodb_service import mongodb_service
from app.services.ollama_service import ollama_service
from app.services.triposr_service import triposr_service
from app.services.hunyuan_world_service import hunyuan_world_service
from app.services.local_storage_service import local_storage_service
from app.api.routes.auth import get_current_user as get_current_user_id
from app.workers.tasks import generate_model_from_uploaded_image, generate_music_world

router = APIRouter(prefix="/api/generation", tags=["generation"])


@router.post("/music-world/{song_id}")
async def trigger_music_world_generation(
    song_id: str,
    user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    Trigger 3D world generation for a song.

    **Steps:**
    1. Retrieve song with mood/energy metadata
    2. Enhance description using Ollama LLM
    3. Generate 3D model screenshot (from music mood)
    4. Create TripoSR task for 3D model generation (local)
    5. Start background task
    6. Return taskId for status polling

    Returns:
        { "task_id": "uuid", "status": "queued", "message": "..." }
    """
    try:
        # Get song from MongoDB
        song = await mongodb_service.get_song(song_id)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")

        # Verify ownership
        if song.userId != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Generate unique task ID
        task_id = str(uuid.uuid4())

        # Update song generation status
        await mongodb_service.update_song(
            song_id,
            {
                "generationStatus": "processing",
                "generationTaskId": task_id,
                "generationProgress": 0,
                "generationError": None
            }
        )

        # Create task record in MongoDB for tracking
        generation_task = {
            "_id": task_id,
            "songId": song_id,
            "userId": user_id,
            "status": "queued",
            "progress": 0,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
            "model_url": None,
            "splat_url": None,
            "music_url": None,
            "error": None,
            "scene_description": None,
            "world_title": None,
        }
        await mongodb_service.db["music_world_generation_tasks"].insert_one(generation_task)

        # Queue Celery task for actual generation (async background job)
        generate_music_world.delay(song_id, task_id, user_id)

        print(f"✅ Music world generation queued for song {song_id} (task: {task_id})")

        return {
            "task_id": task_id,
            "status": "queued",
            "song_id": song_id,
            "message": "World generation started. Poll /status endpoint for progress."
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation error: {str(e)}")


@router.get("/music-world/{task_id}/status")
async def get_music_world_status(
    task_id: str,
    user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    Poll the status of a music world generation task.

    Returns:
        {
            "status": "queued | processing | succeeded | failed",
            "progress": 0-100,
            "model_url": "http://..." (if completed),
            "scene_description": "...",
            "world_title": "...",
            "error": "error message" (if failed)
        }
    """
    try:
        # Get task from MongoDB
        db_task = await mongodb_service.db["music_world_generation_tasks"].find_one({"_id": task_id})
        if not db_task:
            raise HTTPException(status_code=404, detail="Task not found")

        # Verify ownership
        if db_task["userId"] != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        return {
            "task_id": task_id,
            "status": db_task.get("status", "unknown"),
            "progress": db_task.get("progress", 0),
            "model_url": db_task.get("model_url"),
            "splat_url": db_task.get("splat_url"),
            "music_url": db_task.get("music_url"),
            "scene_description": db_task.get("scene_description"),
            "world_title": db_task.get("world_title"),
            "error": db_task.get("error")
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Status poll error: {e}")
        raise HTTPException(status_code=500, detail="Status poll failed")


@router.post("/test-generation")
async def test_generation_pipeline(
    prompt: str,
    user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    Test the local generation pipeline (Ollama + TripoSR).

    **Query params:**
    - prompt: Scene description (e.g., "A futuristic cyberpunk city at night")
    - skip_triposr: Skip TripoSR for testing

    **Returns:**
    ```json
    {
        "task_id": "...",
        "status": "testing",
        "scene_prompt": "Original prompt",
        "enhanced_description": "Enhanced by Ollama",
        "message": "Test in progress..."
    }
    ```
    """
    try:
        if not prompt or len(prompt) < 5:
            raise ValueError("Prompt too short (minimum 5 characters)")

        # Generate unique test ID
        test_id = f"test-{uuid.uuid4()}"

        print(f"🧪 Testing generation pipeline with prompt: {prompt}")

        # Step 1: Enhance description with Ollama
        print("  [1/2] Enhancing description with Ollama...")
        enhanced_description = await ollama_service.enhance_scene_description(prompt)
        print(f"  ✅ Enhanced: {enhanced_description[:100]}...")

        # Step 2: Check TripoSR availability
        triposr_status = triposr_service.get_status()
        print(f"  [2/2] TripoSR status: {triposr_status}")

        return {
            "task_id": test_id,
            "status": "testing_complete",
            "scene_prompt": prompt,
            "enhanced_description": enhanced_description,
            "triposr_status": triposr_status,
            "message": "Test completed successfully. Ready for generation."
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"❌ Test error: {e}")
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


@router.post("/upload-image-for-3d")
async def upload_image_for_3d(
    file: UploadFile = File(...),
    song_id: Optional[str] = None,
    user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    Upload an image for direct 3D model generation with TripoSR.

    **Steps:**
    1. Save uploaded image
    2. Create TripoSR generation task
    3. Return task ID for polling

    Returns:
        {
            "task_id": "...",
            "status": "queued",
            "message": "3D model generation started from image"
        }
    """
    try:
        if not song_id:
            song_id = f"direct-{uuid.uuid4()}"

        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Create task
        task_id = str(uuid.uuid4())

        generation_task = {
            "_id": task_id,
            "songId": song_id,
            "userId": user_id,
            "status": "queued",
            "progress": 0,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
            "image_path": tmp_path,
            "model_url": None,
            "error": None,
        }
        await mongodb_service.db["music_world_generation_tasks"].insert_one(generation_task)
        generate_model_from_uploaded_image.delay(task_id, tmp_path, song_id, user_id)

        print(f"✅ Image upload accepted for 3D generation (task: {task_id})")

        return {
            "task_id": task_id,
            "status": "queued",
            "song_id": song_id,
            "message": "Image received. 3D model generation started. Poll /status for progress."
        }

    except Exception as e:
        print(f"❌ Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/available-models")
async def list_available_models(
    user_id: str = Depends(get_current_user_id)
) -> Dict[str, Any]:
    """
    List generated 3D models from local storage.

    Returns:
        {
            "models": [
                {
                    "song_id": "...",
                    "model_url": "...",
                    "created_at": "...",
                }
            ],
            "total_count": 5
        }
    """
    try:
        # Get user's songs
        user_songs = await mongodb_service.db["songs"].find({"userId": user_id}).to_list(None)

        models = []
        for song in user_songs[:20]:  # Limit to 20
            if song.get("modelUrl"):
                models.append({
                    "song_id": str(song["_id"]),
                    "title": song.get("title", "Untitled"),
                    "model_url": song.get("modelUrl"),
                    "created_at": song.get("generatedAt"),
                })

        return {
            "models": models,
            "total_count": len(models)
        }

    except Exception as e:
        print(f"❌ List models error: {e}")
        return {"models": [], "total_count": 0}


@router.get("/service-status")
async def service_status(user_id: str = Depends(get_current_user_id)) -> Dict[str, Any]:
    """Get status of all generation services (Ollama, TripoSR, HunyuanWorld - all free/open-source)."""
    try:
        ollama_health = await ollama_service.health_check()
        triposr_status = triposr_service.get_status()
        hunyuan_status = hunyuan_world_service.get_status()

        return {
            "ollama": {
                "healthy": ollama_health,
                "base_url": ollama_service.base_url,
                "model": ollama_service.default_model,
                "type": "local_llm"
            },
            "triposr": triposr_status,
            "hunyuan_world": hunyuan_status,
            "storage": {
                "type": "local_filesystem",
                "base_dir": str(local_storage_service.base_dir),
            },
            "note": "All services are free and open-source. No paid APIs are used."
        }

    except Exception as e:
        print(f"❌ Status error: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")
