#!/usr/bin/env python3
"""
Seed database with test data for development
"""
import asyncio
from datetime import datetime
from app.services.mongodb_service import mongodb_service
from app.models import SongDB, VisionDB, UserDB, MoodEnum, AudioFeatures, SceneParameters, LyricSegment

TEST_USER_ID = "test-user-001"
TEST_FIREBASE_UID = "test-firebase-uid-001"


async def seed_database():
    """Populate database with test data"""
    try:
        # Connect to MongoDB
        await mongodb_service.connect()

        # Clear existing test data
        songs_coll = await mongodb_service.get_collection("songs")
        visions_coll = await mongodb_service.get_collection("visions")
        users_coll = await mongodb_service.get_collection("users")

        await songs_coll.delete_many({"userId": TEST_USER_ID})
        await visions_coll.delete_many({"userId": TEST_USER_ID})
        await users_coll.delete_many({"firebaseUid": TEST_FIREBASE_UID})

        print("🧹 Cleared previous test data")

        # Create test user
        test_user = UserDB(
            firebaseUid=TEST_FIREBASE_UID,
            email="test@virtuoso.com",
            displayName="Test User",
            profilePicture="https://avatar.example.com/test.jpg",
            bio="Test user for development",
            createdAt=datetime.utcnow()
        )
        user_id = await mongodb_service.create_user(test_user)
        print(f"✅ Created test user: {user_id}")

        # Create test song with scene parameters
        scene_params = SceneParameters(
            colors={"c1": "#06B6D4", "c2": "#8B5CF6", "c3": "#F97316", "c4": "#22C55E", "c5": "#EC4899"},
            geometryComplexity=0.7,
            geometryDistortion=0.5,
            geometrySharpness=0.4,
            geometryScale=1.2,
            symmetry=0.6,
            terrainHeight=0.3,
            terrainFrequency=0.6,
            terrainErosion=0.4,
            particleDensity=0.7,
            particleSize=0.6,
            particleGravity=0.2,
            particleTurbulence=0.5,
            particleSpread=0.7,
            fogDensity=0.4,
            glowIntensity=0.8,
            noiseScale=0.6,
            rotationSpeed=0.5,
            pulseIntensity=0.5,
            waveSpeed=0.6,
            metalness=0.4,
            roughness=0.5,
            emissiveStrength=0.7,
            transparency=0.2,
            cameraDistance=0.6,
            cameraHeight=0.6,
            bassReactivity=0.7,
            trebleReactivity=0.5,
        )

        test_lyrics = [
            LyricSegment(text="Music to me", timestamp=0.0, confidence=1.0),
            LyricSegment(text="Every since I was a cheat, and why was it shit?", timestamp=0.37, confidence=0.95),
            LyricSegment(text="She oughta keep on the con round, she wanna get hit", timestamp=0.41, confidence=0.95),
            LyricSegment(text="She takes you to me, we coulda get her by my side Double up, bust on the watch", timestamp=0.53, confidence=0.90),
        ]

        test_song = SongDB(
            userId=user_id,
            title="weekend",
            artist="Unknown",
            songUrl="https://example.com/weekend.mp3",
            audioUrl="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",  # Using public test audio
            lyrics=test_lyrics,
            mood=MoodEnum.ENERGETIC,
            audioFeatures=AudioFeatures(
                tempo=120.0,
                energy=0.8,
                danceability=0.75,
                valence=0.7,
                acousticness=0.2
            ),
            visualDescription="An energetic and vibrant musical experience with dynamic 3D patterns",
            sceneParameters=scene_params,
            duration=240.0,
            transcriptionStatus="completed",
            createdAt=datetime.utcnow()
        )

        song_id = await mongodb_service.create_song(test_song)
        print(f"✅ Created test song: {song_id}")

        # Create test vision
        test_vision = VisionDB(
            userId=user_id,
            songId=song_id,
            name="weekend Visualization",
            thumbnail=None,
            playCount=0,
            favorited=False,
            createdAt=datetime.utcnow()
        )

        vision_id = await mongodb_service.create_vision(test_vision)
        print(f"✅ Created test vision: {vision_id}")

        print("\n📊 Seed data created successfully!")
        print(f"   User Firebase UID: {TEST_FIREBASE_UID}")
        print(f"   User ID: {user_id}")
        print(f"   Song ID: {song_id}")
        print(f"   Vision ID: {vision_id}")
        print(f"\n🔗 Open this URL to view the visualization:")
        print(f"   http://localhost:3001/vision/{vision_id}")

        await mongodb_service.disconnect()

    except Exception as e:
        print(f"❌ Seeding failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(seed_database())
