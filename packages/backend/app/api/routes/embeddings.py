from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.services.embeddings_service import embeddings_service
from app.api.routes.auth import get_current_user


router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


class EmbeddingRequest(BaseModel):
    """Request to generate embedding for text"""
    text: str


class SongEmbeddingRequest(BaseModel):
    """Request to generate embedding for a song"""
    song_id: str
    title: str
    description: Optional[str] = ""
    artist: Optional[str] = ""


class SimilarSongsRequest(BaseModel):
    """Request to search for similar songs"""
    query: str
    limit: Optional[int] = 5
    similarity_threshold: Optional[float] = 0.7


class BatchEmbeddingRequest(BaseModel):
    """Request to generate embeddings for multiple songs"""
    songs: List[dict]  # Each dict: {song_id, title, description, artist}


@router.post("/generate")
async def generate_embedding(
    request: EmbeddingRequest,
    authorization: str = Header(None)
):
    """
    Generate embedding for text

    Args:
        request: Text to generate embedding for
        authorization: User auth token

    Returns:
        Embedding vector (1536 dimensions)
    """
    try:
        user_id = await get_current_user(authorization)

        embedding = await embeddings_service.generate_embedding(request.text)

        if not embedding:
            raise HTTPException(status_code=500, detail="Failed to generate embedding")

        return {
            "text": request.text[:100],
            "embedding_dimension": len(embedding),
            "embedding": embedding,
            "status": "success"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/song")
async def generate_song_embedding(
    request: SongEmbeddingRequest,
    authorization: str = Header(None)
):
    """
    Generate and store embedding for a song

    Args:
        request: Song data (id, title, description, artist)
        authorization: User auth token

    Returns:
        Confirmation of embedding generation and storage
    """
    try:
        user_id = await get_current_user(authorization)

        result = await embeddings_service.generate_song_embedding(
            song_id=request.song_id,
            title=request.title,
            description=request.description or "",
            artist=request.artist or ""
        )

        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate song embedding")

        return {
            **result,
            "message": "Song embedding generated and stored successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_similar_songs(
    request: SimilarSongsRequest,
    authorization: str = Header(None)
):
    """
    Search for similar songs based on query

    Args:
        request: Search query and options
        authorization: User auth token

    Returns:
        List of similar songs with similarity scores
    """
    try:
        user_id = await get_current_user(authorization)

        results = await embeddings_service.search_similar_songs(
            query=request.query,
            limit=request.limit,
            similarity_threshold=request.similarity_threshold
        )

        return {
            "query": request.query,
            "results_count": len(results),
            "results": results,
            "status": "success"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/song/{song_id}")
async def get_song_embedding(
    song_id: str,
    authorization: str = Header(None)
):
    """
    Retrieve stored embedding for a song

    Args:
        song_id: ID of the song
        authorization: User auth token

    Returns:
        Stored embedding data
    """
    try:
        user_id = await get_current_user(authorization)

        embedding = await embeddings_service.get_song_embedding(song_id)

        if not embedding:
            raise HTTPException(status_code=404, detail="Embedding not found for this song")

        return {
            "song_id": song_id,
            "embedding": embedding,
            "status": "success"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch")
async def batch_generate_embeddings(
    request: BatchEmbeddingRequest,
    authorization: str = Header(None)
):
    """
    Generate embeddings for multiple songs (async/background)

    Args:
        request: List of songs to embed
        authorization: User auth token

    Returns:
        List of successfully embedded songs
    """
    try:
        user_id = await get_current_user(authorization)

        if not request.songs:
            raise HTTPException(status_code=400, detail="No songs provided")

        if len(request.songs) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 songs per request")

        results = await embeddings_service.batch_generate_embeddings(request.songs)

        return {
            "total_requested": len(request.songs),
            "total_completed": len(results),
            "results": results,
            "status": "success" if len(results) == len(request.songs) else "partial"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
