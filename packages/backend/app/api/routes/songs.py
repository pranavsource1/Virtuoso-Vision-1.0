from fastapi import APIRouter, Header, HTTPException, Depends
from app.services.mongodb_service import mongodb_service
from app.api.routes.auth import get_current_user
from app.models import SongCreate, SongResponse, SongDB, AudioFeatures, MoodEnum, SceneParameters, LyricSegment
from app.workers.tasks import process_song_pipeline
from datetime import datetime

router = APIRouter(prefix="/api/songs", tags=["songs"])


def to_song_response(song: SongDB) -> SongResponse:
    """Serialize a SongDB document including local generation fields."""
    return SongResponse(
        id=song.id,
        title=song.title,
        artist=song.artist,
        mood=song.mood.value,
        lyrics=song.lyrics,
        sceneParameters=song.sceneParameters,
        visualDescription=song.visualDescription or "",
        audioUrl=song.audioUrl,
        duration=song.duration,
        createdAt=song.createdAt.isoformat(),
        modelUrl=song.modelUrl,
        splatUrl=song.splatUrl,
        generatedMusicUrl=song.generatedMusicUrl,
        scene3dDescription=song.scene3dDescription,
        generationTaskId=song.generationTaskId,
        generationStatus=song.generationStatus,
        generationProgress=song.generationProgress,
        generationError=song.generationError,
        generatedAt=song.generatedAt.isoformat() if song.generatedAt else None,
    )


@router.post("")
async def create_song(song_data: SongCreate, authorization: str = Header(None)):
    """Create a new song (triggers background processing)"""
    print(f"\n🎵 CREATE SONG REQUEST")
    print(f"📝 Song URL: {song_data.songUrl}")
    print(f"📝 Title: {song_data.title}")
    print(f"🔐 Auth Header: {'present' if authorization else 'missing'}")

    try:
        print("🔍 Authenticating user...")
        user_id = await get_current_user(authorization)
        print(f"✅ User authenticated: {user_id}")

        # Create song document with initial data
        new_song = SongDB(
            userId=user_id,
            title=song_data.title or "Untitled",
            artist=song_data.artist or "Unknown",
            songUrl=str(song_data.songUrl),
            audioUrl="",  # Will be set after download
            lyrics=[],
            mood=MoodEnum.CALM,
            audioFeatures=AudioFeatures(),
            visualDescription="",
            sceneParameters=SceneParameters(),
            duration=0,
            transcriptionStatus="pending",
        )

        song_id = await mongodb_service.create_song(new_song)

        # Trigger background Celery task
        task = process_song_pipeline.delay(song_id, str(song_data.songUrl), user_id, song_data.vibePrompt or "")

        return {
            "message": "Song processing started",
            "songId": song_id,
            "taskId": task.id,
            "status": "processing",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/user/all")
async def get_user_songs(limit: int = 50, offset: int = 0, authorization: str = Header(None)):
    """Get all songs for current user"""
    try:
        user_id = await get_current_user(authorization)
        songs = await mongodb_service.get_user_songs(user_id, limit=limit, offset=offset)

        return {
            "songs": [
                to_song_response(song)
                for song in songs
            ],
            "count": len(songs),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/task/{task_id}/status")
async def get_task_status(task_id: str, authorization: str = Header(None)):
    """Get the status of a song processing task"""
    try:
        user_id = await get_current_user(authorization)

        # Import Celery app to check task status
        from app.workers.tasks import process_song_pipeline
        task = process_song_pipeline.AsyncResult(task_id)

        status = task.state

        # Get progress data during PROGRESS state, or final result on SUCCESS
        if status == 'PROGRESS':
            result = task.info
        elif status == 'SUCCESS':
            result = task.result
        else:
            result = None

        return {
            "taskId": task_id,
            "status": status,  # PENDING, STARTED, PROGRESS, SUCCESS, FAILURE, RETRY
            "result": result,
            "error": str(task.info) if status == 'FAILURE' else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{song_id}", response_model=SongResponse)
async def get_song(song_id: str, authorization: str = Header(None)):
    """Get song by ID"""
    try:
        user_id = await get_current_user(authorization)
        song = await mongodb_service.get_song(song_id)

        if not song:
            raise HTTPException(status_code=404, detail="Song not found")

        if song.userId != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        return to_song_response(song)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{song_id}")
async def delete_song(song_id: str, authorization: str = Header(None)):
    """Delete a song"""
    try:
        user_id = await get_current_user(authorization)
        song = await mongodb_service.get_song(song_id)

        if not song:
            raise HTTPException(status_code=404, detail="Song not found")

        if song.userId != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        await mongodb_service.delete_song(song_id)

        return {"message": "Song deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/debug/create-sample")
async def create_sample_song(authorization: str = Header(None)):
    """Create a sample song for the current user (debug endpoint)"""
    try:
        user_id = await get_current_user(authorization)

        # Create sample song with scene parameters
        scene_params = SceneParameters(
            colors={"c1": "#06B6D4", "c2": "#8B5CF6", "c3": "#F97316", "c4": "#22C55E", "c5": "#EC4899"},
            geometryComplexity=0.7, geometryDistortion=0.5, geometrySharpness=0.4,
            geometryScale=1.2, symmetry=0.6, terrainHeight=0.3, terrainFrequency=0.6,
            terrainErosion=0.4, particleDensity=0.7, particleSize=0.6,
            particleGravity=0.2, particleTurbulence=0.5, particleSpread=0.7,
            fogDensity=0.4, glowIntensity=0.8, noiseScale=0.6,
            rotationSpeed=0.5, pulseIntensity=0.5, waveSpeed=0.6,
            metalness=0.4, roughness=0.5, emissiveStrength=0.7,
            transparency=0.2, cameraDistance=0.6, cameraHeight=0.6,
            bassReactivity=0.7, trebleReactivity=0.5,
        )

        test_lyrics = [
            LyricSegment(text="Music to me", timestamp=0.0, confidence=1.0),
            LyricSegment(text="Every since I was a cheat, and why was it shit?", timestamp=0.37, confidence=0.95),
            LyricSegment(text="She oughta keep on the con round, she wanna get hit", timestamp=0.41, confidence=0.95),
        ]

        sample_song = SongDB(
            userId=user_id,
            title="weekend", artist="Unknown",
            songUrl="https://example.com/weekend.mp3",
            audioUrl="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            lyrics=test_lyrics,
            mood=MoodEnum.ENERGETIC,
            audioFeatures=AudioFeatures(tempo=120.0, energy=0.8, danceability=0.75),
            visualDescription="An energetic and vibrant musical experience",
            sceneParameters=scene_params,
            duration=240.0,
            transcriptionStatus="completed",
        )

        song_id = await mongodb_service.create_song(sample_song)
        return {
            "songId": song_id,
            "message": "Sample song created successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
