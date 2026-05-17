from supabase import create_client, Client
from typing import Optional, List
from app.config import get_settings


class SupabaseService:
    def __init__(self):
        self.settings = get_settings()
        self.client: Optional[Client] = None

    def initialize(self):
        """Initialize Supabase client"""
        if not self.settings.SUPABASE_URL or not self.settings.SUPABASE_KEY:
            print("⚠️  Supabase credentials not configured")
            return

        try:
            self.client = create_client(self.settings.SUPABASE_URL, self.settings.SUPABASE_KEY)
            print("✅ Supabase initialized successfully")
        except Exception as e:
            print(f"❌ Supabase initialization failed: {e}")

    async def store_embeddings(
        self,
        song_id: str,
        embeddings: List[float],
        description: str
    ) -> bool:
        """Store song embeddings in pgvector"""
        if not self.client:
            self.initialize()
            if not self.client:
                print("⚠️  Supabase not initialized")
                return False

        try:
            response = self.client.table(self.settings.SUPABASE_EMBEDDINGS_TABLE).insert({
                "song_id": song_id,
                "embedding": embeddings,
                "description": description,
            }).execute()
            return bool(response.data)
        except Exception as e:
            print(f"❌ Failed to store embeddings: {e}")
            return False

    async def search_similar_songs(
        self,
        embeddings: List[float],
        limit: int = 5
    ) -> List[dict]:
        """Search for similar songs using embeddings"""
        if not self.client:
            return []

        try:
            # Supabase pgvector similarity search
            response = self.client.rpc(
                "search_embeddings",
                {
                    "query_embedding": embeddings,
                    "match_count": limit,
                }
            ).execute()
            return response.data
        except Exception as e:
            print(f"❌ Search failed: {e}")
            return []

    async def get_embeddings(self, song_id: str) -> Optional[dict]:
        """Get stored embeddings for a song"""
        if not self.client:
            return None

        try:
            response = self.client.table(self.settings.SUPABASE_EMBEDDINGS_TABLE).select("*").eq(
                "song_id", song_id
            ).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"❌ Failed to get embeddings: {e}")
            return None


# Global instance
supabase_service = SupabaseService()
