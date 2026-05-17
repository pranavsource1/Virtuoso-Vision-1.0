from fastapi import APIRouter, Header, HTTPException, Depends
from app.services.mongodb_service import mongodb_service
from app.api.routes.auth import get_current_user
from app.models import VisionCreate, VisionResponse, VisionDB, VisionUpdate
from datetime import datetime

router = APIRouter(prefix="/api/visions", tags=["visions"])


@router.post("/")
async def create_vision(vision_data: VisionCreate, authorization: str = Header(None)):
    """Save a vision (user's saved experience of a song)"""
    try:
        user_id = await get_current_user(authorization)

        # Verify song exists and belongs to user
        song = await mongodb_service.get_song(vision_data.songId)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")

        if song.userId != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        # Create vision
        new_vision = VisionDB(
            userId=user_id,
            songId=vision_data.songId,
            name=vision_data.name or song.title,
            thumbnail=None,
            playCount=0,
            favorited=False,
        )

        vision_id = await mongodb_service.create_vision(new_vision)

        return {
            "message": "Vision saved",
            "visionId": vision_id,
            "name": new_vision.name,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{vision_id}", response_model=VisionResponse)
async def get_vision(vision_id: str, authorization: str = Header(None)):
    """Get vision by ID"""
    try:
        user_id = await get_current_user(authorization)
        vision = await mongodb_service.get_vision(vision_id)

        if not vision:
            raise HTTPException(status_code=404, detail="Vision not found")

        if vision.userId != user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Vision belongs to different user. Your ID: {user_id}, Vision owner: {vision.userId}"
            )

        return VisionResponse(
            id=vision.id,
            songId=vision.songId,
            name=vision.name,
            mood=vision.mood,
            thumbnail=vision.thumbnail,
            playCount=vision.playCount,
            favorited=vision.favorited,
            createdAt=vision.createdAt.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/user/all")
async def get_user_visions(limit: int = 50, offset: int = 0, authorization: str = Header(None)):
    """Get all visions for current user"""
    try:
        user_id = await get_current_user(authorization)
        visions = await mongodb_service.get_user_visions(user_id, limit=limit, offset=offset)

        return {
            "visions": [
                VisionResponse(
                    id=v.id,
                    songId=v.songId,
                    name=v.name,
                    mood=v.mood,
                    thumbnail=v.thumbnail,
                    playCount=v.playCount,
                    favorited=v.favorited,
                    createdAt=v.createdAt.isoformat(),
                )
                for v in visions
            ],
            "count": len(visions),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{vision_id}")
async def update_vision(vision_id: str, update: VisionUpdate, authorization: str = Header(None)):
    """Update vision"""
    try:
        user_id = await get_current_user(authorization)
        vision = await mongodb_service.get_vision(vision_id)

        if not vision:
            raise HTTPException(status_code=404, detail="Vision not found")

        if vision.userId != user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Vision belongs to different user. Your ID: {user_id}, Vision owner: {vision.userId}"
            )

        update_data = {}
        if update.name is not None and update.name.strip():
            update_data["name"] = update.name.strip()
        if update.favorited is not None:
            update_data["favorited"] = update.favorited

        if not update_data:
            raise HTTPException(status_code=400, detail="No valid update fields provided")

        await mongodb_service.update_vision(vision_id, update_data)

        return {"message": "Vision updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{vision_id}")
async def delete_vision(vision_id: str, authorization: str = Header(None)):
    """Delete a vision"""
    try:
        user_id = await get_current_user(authorization)
        vision = await mongodb_service.get_vision(vision_id)

        if not vision:
            raise HTTPException(status_code=404, detail="Vision not found")

        if vision.userId != user_id:
            raise HTTPException(
                status_code=403,
                detail=f"Vision belongs to different user. Your ID: {user_id}, Vision owner: {vision.userId}"
            )

        await mongodb_service.delete_vision(vision_id)

        return {"message": "Vision deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug/info")
async def debug_info(authorization: str = Header(None)):
    """Debug endpoint to check auth status"""
    try:
        user_id = await get_current_user(authorization)
        visions_coll = await mongodb_service.get_collection("visions")
        all_visions = []
        async for doc in visions_coll.find().limit(10):
            all_visions.append({
                "id": str(doc.get("_id")),
                "userId": doc.get("userId"),
                "songId": doc.get("songId"),
                "name": doc.get("name"),
            })
        return {
            "currentUserId": user_id,
            "allVisions": all_visions,
            "message": "Debug info - check currentUserId matches vision userId",
        }
    except Exception as e:
        return {"error": str(e)}


@router.post("/debug/create-sample")
async def create_sample_vision(song_id: str = None, authorization: str = Header(None)):
    """Create a sample vision for the current user (debug endpoint)"""
    try:
        user_id = await get_current_user(authorization)

        # If no song_id provided, get or create one
        if not song_id:
            user_songs = await mongodb_service.get_user_songs(user_id, limit=1)
            if user_songs:
                song_id = user_songs[0].id
            else:
                raise HTTPException(status_code=400, detail="No song found. Create a sample song first using /api/songs/debug/create-sample")

        song = await mongodb_service.get_song(song_id)
        if not song:
            raise HTTPException(status_code=404, detail=f"Song {song_id} not found")

        if song.userId != user_id:
            raise HTTPException(status_code=403, detail="Song does not belong to you")

        # Create vision
        new_vision = VisionDB(
            userId=user_id,
            songId=song_id,
            name=song.title + " Visualization",
            thumbnail=None,
            playCount=0,
            favorited=False,
        )

        vision_id = await mongodb_service.create_vision(new_vision)

        return {
            "visionId": vision_id,
            "message": "Sample vision created successfully",
            "url": f"http://localhost:3001/vision/{vision_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
