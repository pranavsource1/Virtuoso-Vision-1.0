from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from typing import Optional, List
from bson.objectid import ObjectId
from app.config import get_settings
from app.models import SongDB, VisionDB, UserDB


class MongoDBService:
    def __init__(self):
        self.settings = get_settings()
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None

    async def connect(self):
        """Connect to MongoDB"""
        try:
            self.client = AsyncIOMotorClient(self.settings.MONGODB_URL)
            self.db = self.client[self.settings.MONGODB_DB]
            # Verify connection
            await self.client.admin.command("ping")
            print("✅ MongoDB connected successfully")
        except Exception as e:
            print(f"❌ MongoDB connection failed: {e}")
            raise

    async def disconnect(self):
        """Disconnect from MongoDB"""
        if self.client:
            self.client.close()
            print("✅ MongoDB disconnected")

    async def get_collection(self, collection_name: str) -> AsyncIOMotorCollection:
        """Get a collection"""
        if self.db is None:
            await self.connect()
        return self.db[collection_name]

    # ============ SONGS ============

    async def create_song(self, song: SongDB) -> str:
        """Create a new song"""
        collection = await self.get_collection("songs")
        result = await collection.insert_one(song.dict(exclude={"_id"}, exclude_none=True))
        return str(result.inserted_id)

    async def get_song(self, song_id: str) -> Optional[SongDB]:
        """Get song by ID"""
        collection = await self.get_collection("songs")
        doc = await collection.find_one({"_id": ObjectId(song_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
            return SongDB(**doc)
        return None

    async def get_user_songs(self, user_id: str, limit: int = 50, offset: int = 0) -> List[SongDB]:
        """Get all songs for a user"""
        collection = await self.get_collection("songs")
        cursor = collection.find({"userId": user_id}).skip(offset).limit(limit).sort("createdAt", -1)
        songs = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            songs.append(SongDB(**doc))
        return songs

    async def update_song(self, song_id: str, update_data: dict) -> bool:
        """Update song"""
        collection = await self.get_collection("songs")
        from datetime import datetime
        update_data["updatedAt"] = datetime.utcnow()
        result = await collection.update_one(
            {"_id": ObjectId(song_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def delete_song(self, song_id: str) -> bool:
        """Delete song"""
        collection = await self.get_collection("songs")
        result = await collection.delete_one({"_id": ObjectId(song_id)})
        return result.deleted_count > 0

    # ============ VISIONS ============

    async def create_vision(self, vision: VisionDB) -> str:
        """Create a new vision"""
        collection = await self.get_collection("visions")
        result = await collection.insert_one(vision.dict(exclude={"_id"}, exclude_none=True))
        return str(result.inserted_id)

    async def get_vision(self, vision_id: str) -> Optional[VisionDB]:
        """Get vision by ID"""
        collection = await self.get_collection("visions")
        doc = await collection.find_one({"_id": ObjectId(vision_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
            return VisionDB(**doc)
        return None

    async def get_user_visions(self, user_id: str, limit: int = 50, offset: int = 0) -> List[VisionDB]:
        """Get all visions for a user"""
        collection = await self.get_collection("visions")
        cursor = collection.find({"userId": user_id}).skip(offset).limit(limit).sort("createdAt", -1)
        visions = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            visions.append(VisionDB(**doc))
        return visions

    async def update_vision(self, vision_id: str, update_data: dict) -> bool:
        """Update vision"""
        collection = await self.get_collection("visions")
        from datetime import datetime
        update_data["updatedAt"] = datetime.utcnow()
        result = await collection.update_one(
            {"_id": ObjectId(vision_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def delete_vision(self, vision_id: str) -> bool:
        """Delete vision"""
        collection = await self.get_collection("visions")
        result = await collection.delete_one({"_id": ObjectId(vision_id)})
        return result.deleted_count > 0

    # ============ USERS ============

    async def create_user(self, user: UserDB) -> str:
        """Create a new user"""
        collection = await self.get_collection("users")
        result = await collection.insert_one(user.dict(exclude={"_id"}, exclude_none=True))
        return str(result.inserted_id)

    async def get_user(self, user_id: str) -> Optional[UserDB]:
        """Get user by MongoDB ID"""
        collection = await self.get_collection("users")
        doc = await collection.find_one({"_id": ObjectId(user_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
            return UserDB(**doc)
        return None

    async def get_user_by_firebase_uid(self, firebase_uid: str) -> Optional[UserDB]:
        """Get user by Firebase UID"""
        collection = await self.get_collection("users")
        doc = await collection.find_one({"firebaseUid": firebase_uid})
        if doc:
            doc["_id"] = str(doc["_id"])
            return UserDB(**doc)
        return None

    async def update_user(self, user_id: str, update_data: dict) -> bool:
        """Update user"""
        collection = await self.get_collection("users")
        from datetime import datetime
        update_data["updatedAt"] = datetime.utcnow()
        result = await collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def delete_user(self, user_id: str) -> bool:
        """Delete user"""
        collection = await self.get_collection("users")
        result = await collection.delete_one({"_id": ObjectId(user_id)})
        return result.deleted_count > 0


# Global instance
mongodb_service = MongoDBService()
