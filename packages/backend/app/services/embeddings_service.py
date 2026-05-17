import openai
from openai import OpenAI
from typing import List, Optional, Dict
from app.config import get_settings
from app.services.supabase_service import supabase_service


class EmbeddingsService:
    """Service for generating and managing song embeddings with OpenAI and Supabase"""

    def __init__(self):
        self.settings = get_settings()
        self.client = None
        self.initialize()

    def initialize(self):
        """Initialize OpenAI client"""
        if not self.settings.OPENAI_API_KEY:
            print("⚠️  OpenAI API key not configured")
            return

        try:
            self.client = OpenAI(api_key=self.settings.OPENAI_API_KEY)
            print("✅ OpenAI Embeddings Service initialized")
        except Exception as e:
            print(f"❌ OpenAI initialization failed: {e}")

    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding for text using OpenAI

        Args:
            text: Text to generate embedding for

        Returns:
            List of floats representing the embedding (1536 dimensions for text-embedding-3-small)
            or None if generation fails
        """
        if not self.client:
            print("⚠️  OpenAI client not initialized")
            return None

        try:
            response = self.client.embeddings.create(
                model="text-embedding-3-small",  # Cost-effective, 1536 dimensions
                input=text
            )
            embedding = response.data[0].embedding
            print(f"✅ Generated embedding for: {text[:50]}...")
            return embedding
        except Exception as e:
            print(f"❌ Failed to generate embedding: {e}")
            return None

    async def generate_song_embedding(
        self,
        song_id: str,
        title: str,
        description: str = "",
        artist: str = ""
    ) -> Optional[Dict]:
        """
        Generate and store embedding for a song

        Args:
            song_id: ID of the song
            title: Song title
            description: Song description/lyrics
            artist: Artist name

        Returns:
            Dict with embedding data or None if fails
        """
        # Combine all text for richer embedding
        combined_text = f"{title} by {artist}. {description}".strip()

        embedding = await self.generate_embedding(combined_text)
        if not embedding:
            return None

        # Store in Supabase
        success = await supabase_service.store_embeddings(
            song_id=song_id,
            embeddings=embedding,
            description=combined_text
        )

        if success:
            return {
                "song_id": song_id,
                "title": title,
                "embedding_dimension": len(embedding),
                "stored": True
            }
        return None

    async def search_similar_songs(
        self,
        query: str,
        limit: int = 5,
        similarity_threshold: float = 0.7
    ) -> List[Dict]:
        """
        Search for similar songs based on query text

        Args:
            query: Search query text
            limit: Maximum number of results
            similarity_threshold: Minimum similarity score (0-1)

        Returns:
            List of similar songs with similarity scores
        """
        # Generate embedding for query
        query_embedding = await self.generate_embedding(query)
        if not query_embedding:
            return []

        # Search Supabase for similar embeddings
        results = await supabase_service.search_similar_songs(
            embeddings=query_embedding,
            limit=limit
        )

        # Filter by threshold if needed
        filtered = [r for r in results if r.get("similarity", 0) >= similarity_threshold]
        return filtered

    async def get_song_embedding(self, song_id: str) -> Optional[Dict]:
        """
        Retrieve stored embedding for a song

        Args:
            song_id: ID of the song

        Returns:
            Embedding data or None if not found
        """
        return await supabase_service.get_embeddings(song_id)

    async def batch_generate_embeddings(
        self,
        songs: List[Dict]
    ) -> List[Dict]:
        """
        Generate embeddings for multiple songs

        Args:
            songs: List of song dicts with {song_id, title, description, artist}

        Returns:
            List of successfully embedded songs
        """
        results = []
        for song in songs:
            result = await self.generate_song_embedding(
                song_id=song.get("song_id"),
                title=song.get("title", ""),
                description=song.get("description", ""),
                artist=song.get("artist", "")
            )
            if result:
                results.append(result)

        print(f"✅ Batch embedding complete: {len(results)}/{len(songs)} songs")
        return results


# Global instance
embeddings_service = EmbeddingsService()
