"""Local ambient audio generation for generated worlds."""
import math
import random
import tempfile
import wave
from pathlib import Path

from app.services.local_storage_service import local_storage_service


class LocalMusicService:
    """Creates small local WAV loops as a free fallback for ambient world audio."""

    def __init__(self):
        self.sample_rate = 22050

    async def generate_ambient_music(
        self,
        song_id: str,
        scene_description: str,
        mood: str = "ambient",
        duration_seconds: int = 24,
    ) -> str:
        """Generate a simple procedural ambient WAV file and return its public URL."""
        seed = f"{song_id}:{mood}:{scene_description[:120]}"
        rng = random.Random(seed)
        duration_seconds = max(8, min(duration_seconds, 60))
        frame_count = int(self.sample_rate * duration_seconds)

        root = 110 + rng.randint(0, 7) * 12
        intervals = [0, 5, 7, 12] if mood in {"happy", "uplifting", "energetic"} else [0, 3, 7, 10]
        freqs = [root * (2 ** (interval / 12)) for interval in intervals]

        with tempfile.TemporaryDirectory() as temp_dir:
            wav_path = Path(temp_dir) / "ambient.wav"
            with wave.open(str(wav_path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(self.sample_rate)

                for i in range(frame_count):
                    t = i / self.sample_rate
                    envelope = min(1.0, t / 3.0, (duration_seconds - t) / 3.0)
                    drift = 1.0 + 0.004 * math.sin(t * 0.17)
                    sample = 0.0

                    for idx, freq in enumerate(freqs):
                        amp = 0.12 / (idx + 1)
                        wobble = 1.0 + 0.01 * math.sin(t * (0.09 + idx * 0.03))
                        sample += amp * math.sin(2 * math.pi * freq * drift * wobble * t)
                        sample += (amp * 0.35) * math.sin(2 * math.pi * freq * 2.01 * t)

                    shimmer = 0.035 * math.sin(2 * math.pi * (root * 4.0) * t + math.sin(t * 0.7))
                    sample = (sample + shimmer) * envelope
                    sample = max(-0.95, min(0.95, sample))
                    wav.writeframesraw(int(sample * 32767).to_bytes(2, "little", signed=True))

            relative_path = await local_storage_service.save_music(str(wav_path), song_id, "ambient")

        return await local_storage_service.get_public_url(relative_path) if relative_path else ""


music_service = LocalMusicService()
