import asyncio
import glob
import json
import os
import subprocess
from datetime import datetime
from typing import Optional

from app.config import get_settings
from app.ml.mood_classifier import mood_classifier
from app.ml.ollama_wrapper import ollama_service
from app.ml.whisper_wrapper import WhisperService
from app.models import AudioFeatures, MoodEnum, SceneParameters
from app.services.mongodb_service import mongodb_service
from app.services.supabase_service import supabase_service
from app.workers.celery_app import app


class PermanentPipelineError(Exception):
    """A failure that should not be retried by Celery."""


def run_async(coro):
    """Run async code from a synchronous Celery worker."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


def public_media_url(file_path: str) -> str:
    settings = get_settings()
    return f"{settings.PUBLIC_API_URL.rstrip('/')}/media/{os.path.basename(file_path)}"


def get_audio_duration(audio_path: str) -> float:
    """Read audio duration with ffprobe when available."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                audio_path,
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=20,
        )
        payload = json.loads(result.stdout or "{}")
        return float(payload.get("format", {}).get("duration") or 0)
    except Exception as exc:
        print(f"Could not read audio duration: {exc}")
        return 0


@app.task(bind=True, max_retries=3)
def process_song_pipeline(self, song_id: str, audio_url: str, user_id: str):
    """
    Main pipeline:
    1. Download audio
    2. Transcribe with Whisper
    3. Classify mood
    4. Generate visual prompt with local Ollama
    5. Generate scene parameters with local Ollama
    6. Store embeddings in Supabase
    7. Create a vision for the user
    """
    try:
        print(f"Starting song pipeline for song_id={song_id}")
        run_async(mongodb_service.update_song(song_id, {"transcriptionStatus": "processing"}))

        print("Step 1: Downloading audio...")
        audio_path = download_audio_sync(audio_url, song_id)
        if not audio_path:
            raise PermanentPipelineError("Failed to download an audio stream from the submitted URL")

        audio_public_url = public_media_url(audio_path)
        audio_duration = get_audio_duration(audio_path)

        print("Step 2: Transcribing audio...")
        whisper_service = WhisperService()
        lyrics_segments, full_lyrics = run_async(whisper_service.transcribe_audio(audio_path))
        if not full_lyrics:
            raise Exception("Transcription failed")

        print("Step 3: Classifying mood...")
        mood = run_async(mood_classifier.classify_mood(full_lyrics))

        print("Step 4: Generating visual prompt with local Ollama...")
        visual_prompt = run_async(
            ollama_service.generate_visual_prompt(full_lyrics[:500], mood.value)
        )
        if not visual_prompt:
            visual_prompt = "A dynamic, colorful 3D landscape that shifts with the rhythm."

        print("Step 5: Generating scene parameters with local Ollama...")
        scene_params = run_async(
            ollama_service.generate_scene_parameters(mood.value, visual_prompt, "", "")
        )
        if not scene_params:
            scene_params = SceneParameters()

        print("Updating song in database...")
        update_data = {
            "lyrics": [seg.dict() for seg in lyrics_segments],
            "mood": mood.value,
            "audioFeatures": AudioFeatures().dict(),
            "visualDescription": visual_prompt,
            "sceneParameters": scene_params.dict(),
            "audioUrl": audio_public_url,
            "duration": audio_duration,
            "transcriptionStatus": "completed",
            "updatedAt": datetime.utcnow(),
        }
        run_async(mongodb_service.update_song(song_id, update_data))

        if full_lyrics:
            embeddings = [0.1] * 1536
            run_async(supabase_service.store_embeddings(song_id, embeddings, visual_prompt))

        song = run_async(mongodb_service.get_song(song_id))
        if song:
            from app.models import VisionDB

            new_vision = VisionDB(
                userId=user_id,
                songId=song_id,
                name=song.title,
                thumbnail=None,
                playCount=0,
                favorited=False,
                mood=mood.value if mood else MoodEnum.CALM.value,
            )
            run_async(mongodb_service.create_vision(new_vision))
            print(f"Created vision for song {song_id}")

        print("Song processing complete")
        send_completion_notification.delay(song_id, user_id)

        return {"status": "completed", "song_id": song_id}

    except Exception as exc:
        print(f"Pipeline failed: {exc}")
        run_async(
            mongodb_service.update_song(
                song_id,
                {
                    "transcriptionStatus": "failed",
                    "updatedAt": datetime.utcnow(),
                },
            )
        )

        if isinstance(exc, PermanentPipelineError) or self.request.retries >= self.max_retries:
            return {"status": "failed", "song_id": song_id, "error": str(exc)}

        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


def download_audio_sync(audio_url: str, song_id: str) -> Optional[str]:
    """Download an audio stream from a URL and return a local audio file path."""
    try:
        import yt_dlp

        settings = get_settings()
        media_dir = os.path.abspath(settings.MEDIA_DIR)
        os.makedirs(media_dir, exist_ok=True)

        base_path = os.path.join(media_dir, song_id)
        output_path = f"{base_path}.mp3"
        audio_extensions = {".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav", ".webm"}

        for file_path in glob.glob(f"{base_path}*"):
            try:
                os.remove(file_path)
            except OSError:
                pass

        ydl_opts = {
            "format": "bestaudio[acodec!=none][vcodec=none]/bestaudio[acodec!=none]/best[acodec!=none]",
            "format_sort": ["hasaud", "abr", "asr", "ext"],
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "outtmpl": f"{base_path}.%(ext)s",
            "noplaylist": True,
            "overwrites": True,
            "quiet": False,
            "no_warnings": False,
            "extractor_args": {
                "youtube": {
                    "player_client": ["mweb", "web"],
                }
            },
            "js_runtimes": {"node": {}},
            "remote_components": ["ejs:github"],
            "nocheckcertificate": True,
            "ignoreerrors": False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([audio_url])

        if os.path.exists(output_path):
            print(f"Audio downloaded to {output_path}")
            return output_path

        matches = [
            path
            for path in glob.glob(f"{base_path}.*")
            if os.path.splitext(path)[1].lower() in audio_extensions
        ]
        if matches:
            print(f"Expected mp3 not found, using audio fallback: {matches[0]}")
            return matches[0]

        print(f"No audio output file found at {base_path}.*")
        return None
    except Exception as exc:
        print(f"Download failed: {exc}")
        import traceback

        traceback.print_exc()
        return None


@app.task
def send_completion_notification(song_id: str, user_id: str):
    """Send notification to user when a song is processed."""
    try:
        song = run_async(mongodb_service.get_song(song_id))
        if not song:
            return

        user = run_async(mongodb_service.get_user_by_firebase_uid(user_id))
        if not user:
            try:
                user = run_async(mongodb_service.get_user(user_id))
            except Exception:
                pass
            if not user:
                return

        import requests

        settings = get_settings()
        if settings.N8N_WEBHOOK_URL:
            requests.post(
                settings.N8N_WEBHOOK_URL,
                json={
                    "userId": user_id,
                    "email": user.email,
                    "displayName": user.displayName,
                    "songTitle": song.title,
                    "songId": song_id,
                    "message": f"Your song '{song.title}' has been transformed into a vision!",
                },
                timeout=10,
            )
        print(f"Notification sent for song {song_id}")
    except Exception as exc:
        print(f"Notification failed: {exc}")
