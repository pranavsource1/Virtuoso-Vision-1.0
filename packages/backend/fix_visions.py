import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def main():
    client = AsyncIOMotorClient("mongodb://mongodb:27017/virtuosovision")
    db = client.virtuosovision
    
    songs = await db.songs.find({"transcriptionStatus": "completed"}).to_list(length=None)
    for song in songs:
        vision = await db.visions.find_one({"songId": str(song["_id"])})
        if not vision:
            print(f"Creating vision for song {song['title']}")
            new_vision = {
                "userId": song["userId"],
                "songId": str(song["_id"]),
                "name": song["title"],
                "mood": song.get("mood", "calm"),
                "thumbnail": None,
                "playCount": 0,
                "favorited": False,
                "createdAt": song.get("createdAt", None),
                "updatedAt": song.get("updatedAt", None)
            }
            await db.visions.insert_one(new_vision)
            print("Vision created.")
        else:
            print(f"Vision already exists for {song['title']}")

asyncio.run(main())
