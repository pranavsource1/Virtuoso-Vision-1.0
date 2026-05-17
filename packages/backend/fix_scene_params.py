"""Migrate existing songs to use the new mathematical fingerprint SceneParameters."""
import asyncio, math, hashlib
from motor.motor_asyncio import AsyncIOMotorClient

def generate_params(title, mood, seed_str):
    h = int(hashlib.md5(seed_str.encode()).hexdigest(), 16)
    def f(off, lo=0.0, hi=1.0):
        return lo + ((h >> off) % 10000) / 9999.0 * (hi - lo)
    def hue_to_hex(hue):
        r = int(128 + 127 * math.sin(math.radians(hue)))
        g = int(128 + 127 * math.sin(math.radians(hue + 120)))
        b = int(128 + 127 * math.sin(math.radians(hue + 240)))
        return f"#{r:02x}{g:02x}{b:02x}"

    hues = [f(i*7, 0, 360) for i in range(5)]
    return {
        "colors": {f"c{i+1}": hue_to_hex(hues[i]) for i in range(5)},
        "geometryComplexity": f(0), "geometryDistortion": f(3), "geometrySharpness": f(6),
        "geometryScale": f(9, 0.5, 2.5), "symmetry": f(12),
        "terrainHeight": f(15), "terrainFrequency": f(18), "terrainErosion": f(21),
        "particleDensity": f(24), "particleSize": f(27), "particleGravity": f(30, -1, 1),
        "particleTurbulence": f(33), "particleSpread": f(36),
        "fogDensity": f(39, 0.1, 0.5), "glowIntensity": f(42), "noiseScale": f(45),
        "rotationSpeed": f(48), "pulseIntensity": f(51), "waveSpeed": f(54),
        "metalness": f(57), "roughness": f(60), "emissiveStrength": f(63, 0.3, 0.8),
        "transparency": f(2, 0, 0.3), "cameraDistance": f(5, 0.3, 0.7),
        "cameraHeight": f(8, 0.3, 0.7), "bassReactivity": f(11, 0.3, 0.9),
        "trebleReactivity": f(14, 0.2, 0.7),
    }

async def main():
    db = AsyncIOMotorClient("mongodb://mongodb:27017/virtuosovision").virtuosovision
    async for song in db.songs.find():
        title = song.get("title", "unknown")
        mood = song.get("mood", "calm")
        sid = str(song["_id"])
        params = generate_params(title, mood, f"{title}-{mood}-{sid}")
        await db.songs.update_one({"_id": song["_id"]}, {"$set": {"sceneParameters": params}})
        print(f"✅ {title} ({mood}) -> unique fingerprint (distortion={params['geometryDistortion']:.2f}, complexity={params['geometryComplexity']:.2f})")
    print("Done!")

asyncio.run(main())
