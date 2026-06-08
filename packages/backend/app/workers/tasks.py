import asyncio
import glob
import json
import os
import subprocess
import tempfile
from datetime import datetime
from typing import Optional, Tuple

from app.config import get_settings
from app.ml.mood_classifier import mood_classifier
from app.ml.ollama_wrapper import ollama_service as lyric_ollama_service
from app.ml.whisper_wrapper import WhisperService
from app.ml.audio_features import audio_feature_extractor  # NEW
from app.ml.lyric_sentiment import lyric_sentiment_analyzer  # NEW
from app.ml.song_structure import song_structure_detector  # NEW
from app.models import AudioFeatures, MoodEnum, SceneParameters
from app.services.mongodb_service import mongodb_service
from app.services.supabase_service import supabase_service
from app.services.local_storage_service import local_storage_service
from app.services.music_service import music_service
from app.services.ollama_service import ollama_service as world_ollama_service
from app.services.triposr_service import triposr_service
from app.services.hunyuan_world_service import hunyuan_world_service
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
def process_song_pipeline(self, song_id: str, audio_url: str, user_id: str, vibe_prompt: str = ""):
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
        self.update_state(state='PROGRESS', meta={'current_stage': 0, 'progress': 15})
        result = download_audio_sync(audio_url, song_id)
        if not result:
            raise PermanentPipelineError("Failed to download an audio stream from the submitted URL")

        audio_path, thumbnail_url = result
        audio_public_url = public_media_url(audio_path)
        audio_duration = get_audio_duration(audio_path)

        print("Step 2: Transcribing audio...")
        self.update_state(state='PROGRESS', meta={'current_stage': 1, 'progress': 35})
        whisper_service = WhisperService()
        lyrics_segments, full_lyrics = run_async(whisper_service.transcribe_audio(audio_path))
        if not full_lyrics:
            raise Exception("Transcription failed")

        print("Step 3: Classifying mood...")
        self.update_state(state='PROGRESS', meta={'current_stage': 2, 'progress': 50})
        mood = run_async(mood_classifier.classify_mood(full_lyrics))

        print("Step 3b: Extracting audio features...")  # NEW
        self.update_state(state='PROGRESS', meta={'current_stage': 2, 'progress': 55})
        audio_features = run_async(audio_feature_extractor.extract_features(audio_path))

        print("Step 3c: Analyzing lyric sentiment...")  # NEW
        self.update_state(state='PROGRESS', meta={'current_stage': 2, 'progress': 60})
        lyrics_with_sentiment = run_async(lyric_sentiment_analyzer.analyze_lyrics(
            [seg.dict() for seg in lyrics_segments]
        ))

        print("Step 3d: Detecting song sections...")  # NEW
        self.update_state(state='PROGRESS', meta={'current_stage': 3, 'progress': 65})
        song_sections_result = run_async(song_structure_detector.detect_sections(audio_path))
        song_sections = song_sections_result.get("sections", [])

        print("Step 4: Generating visual prompt with local Ollama...")
        self.update_state(state='PROGRESS', meta={'current_stage': 3, 'progress': 70})
        visual_prompt = run_async(
            lyric_ollama_service.generate_visual_prompt(full_lyrics[:500], mood.value)
        )
        if not visual_prompt:
            visual_prompt = "A dynamic, colorful 3D landscape that shifts with the rhythm."

        print("Step 5: Generating scene parameters with local Ollama...")
        self.update_state(state='PROGRESS', meta={'current_stage': 4, 'progress': 85})
        scene_params = run_async(
            lyric_ollama_service.generate_scene_parameters(mood.value, visual_prompt, "", "", vibe_prompt)
        )
        if not scene_params:
            scene_params = SceneParameters()

        print("Step 6: Generating scene choreography...")  # NEW
        self.update_state(state='PROGRESS', meta={'current_stage': 5, 'progress': 88})
        choreography = run_async(
            lyric_ollama_service.generate_scene_choreography(
                base_parameters=scene_params,
                song_sections=song_sections,
                lyrical_moments=[
                    {"timestamp": seg["timestamp"], "sentiment": seg.get("sentiment", "neutral"),
                     "intensity": seg.get("intensity", 0.5), "text": seg.get("text", "")}
                    for seg in lyrics_with_sentiment
                    if seg.get("intensity", 0.5) > 0.6  # Only high-intensity moments
                ],
                mood=mood.value,
                song_title="",
                audio_features=audio_features
            )
        )

        print("Updating song in database...")
        self.update_state(state='PROGRESS', meta={'current_stage': 5, 'progress': 95})
        update_data = {
            "lyrics": lyrics_with_sentiment,  # NEW: Include sentiment and intensity
            "mood": mood.value,
            "audioFeatures": audio_features,  # NEW: Full features instead of defaults
            "visualDescription": visual_prompt,
            "sceneParameters": scene_params.dict(),
            "sceneChoreography": choreography,  # NEW: Add choreography
            "audioUrl": audio_public_url,
            "thumbnailUrl": thumbnail_url,
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
                thumbnail=thumbnail_url,
                playCount=0,
                favorited=False,
                mood=mood.value if mood else MoodEnum.CALM.value,
            )
            run_async(mongodb_service.create_vision(new_vision))
            print(f"Created vision for song {song_id}")

        print("Song processing complete")
        send_completion_notification.delay(song_id, user_id)

        return {"status": "completed", "songId": song_id}

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


def download_audio_sync(audio_url: str, song_id: str) -> Optional[Tuple[str, str]]:
    """Download an audio stream from a URL and extract thumbnail. Returns (audio_path, thumbnail_url)."""
    try:
        import yt_dlp

        settings = get_settings()
        media_dir = os.path.abspath(settings.MEDIA_DIR)
        os.makedirs(media_dir, exist_ok=True)

        base_path = os.path.join(media_dir, song_id)
        output_path = f"{base_path}.mp3"
        thumbnail_path = f"{base_path}.jpg"
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
            "writethumbnail": True,
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

        thumbnail_url = ""

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(audio_url, download=True)
            # Get thumbnail URL from extracted info
            if info and "thumbnail" in info:
                thumbnail_url = info["thumbnail"]
                print(f"Extracted thumbnail URL: {thumbnail_url}")

        if os.path.exists(output_path):
            print(f"Audio downloaded to {output_path}")
            return (output_path, thumbnail_url)

        matches = [
            path
            for path in glob.glob(f"{base_path}.*")
            if os.path.splitext(path)[1].lower() in audio_extensions
        ]
        if matches:
            print(f"Expected mp3 not found, using audio fallback: {matches[0]}")
            return (matches[0], thumbnail_url)

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


# ===========================
# LOCAL MUSIC WORLD GENERATION
# ===========================

async def _update_generation_task(task_id: Optional[str], update_data: dict):
    """Update the MongoDB task document used by the frontend status poller."""
    if not task_id:
        return

    collection = await mongodb_service.get_collection("music_world_generation_tasks")
    update_data["updatedAt"] = datetime.utcnow()
    await collection.update_one({"_id": task_id}, {"$set": update_data})


def _song_mood_value(song) -> str:
    mood = getattr(song, "mood", "ambient")
    return getattr(mood, "value", str(mood))


def _lyrics_sample(song, max_chars: int = 900) -> str:
    text = " ".join(segment.text for segment in (song.lyrics or []) if getattr(segment, "text", None))
    return text[:max_chars]


def _scene_colors(song) -> dict:
    params = getattr(song, "sceneParameters", None)
    return getattr(params, "colors", {}) if params else {}


def _progress(self, task_id: Optional[str], song_id: str, stage: int, progress: int, message: str):
    print(message)
    self.update_state(state="PROGRESS", meta={"current_stage": stage, "progress": progress})
    run_async(_update_generation_task(task_id, {"status": "processing", "progress": progress}))
    run_async(
        mongodb_service.update_song(
            song_id,
            {
                "generationStatus": "processing",
                "generationTaskId": task_id,
                "generationProgress": progress,
                "generationError": None,
            },
        )
    )


async def _mark_generation_failed(song_id: str, task_id: Optional[str], error: str):
    await mongodb_service.update_song(
        song_id,
        {
            "generationStatus": "failed",
            "generationError": error,
            "updatedAt": datetime.utcnow(),
        },
    )
    await _update_generation_task(task_id, {"status": "failed", "error": error})


@app.task(name="app.workers.tasks.generate_music_world", bind=True, max_retries=1)
def generate_music_world(
    self,
    song_id: str,
    task_id: Optional[str] = None,
    user_id: Optional[str] = None,
    preferred_3d_service: str = "triposr"  # or "hunyuan_world"
):
    """
    Generate a local 3D world for a song.

    Local-only pipeline (100% FREE and open-source):
    1. Ollama enhances the song's visual prompt.
    2. Selected 3D service (TripoSR or HunyuanWorld) generates GLB.
    3. Fallback to procedural GLB if both services unavailable.
    4. Local storage serves model/audio files through /media.

    Args:
        song_id: MongoDB song ID
        task_id: Generation task tracking ID (for frontend polling)
        user_id: Owning user ID
        preferred_3d_service: "triposr" (default) or "hunyuan_world"
    """
    if user_id is None:
        user_id = task_id
        task_id = self.request.id

    try:
        _progress(self, task_id, song_id, 0, 8, f"Starting local world generation for song {song_id}")

        song = run_async(mongodb_service.get_song(song_id))
        if not song:
            raise Exception(f"Song {song_id} not found")
        if user_id and song.userId != user_id:
            raise Exception("Song does not belong to this user")

        mood = _song_mood_value(song)
        prompt_seed = song.visualDescription or _lyrics_sample(song) or f"{song.title} by {song.artist or 'unknown artist'}"

        _progress(self, task_id, song_id, 1, 24, "Enhancing 3D scene with local Ollama")
        world_text = run_async(
            world_ollama_service.generate_world_title_and_description(
                music_mood=mood,
                user_prompt=prompt_seed,
            )
        )
        world_title = world_text.get("title") or f"{song.title} World"
        scene_description = world_text.get("description") or prompt_seed
        world_lore = world_text.get("lore") or "An ethereal realm born from the echoes of forgotten melodies."
        scene_description = run_async(world_ollama_service.enhance_scene_description(scene_description))

        run_async(
            mongodb_service.update_song(
                song_id,
                {
                    "scene3dDescription": scene_description,
                    "worldLore": world_lore,
                    "generationProgress": 35,
                },
            )
        )
        run_async(
            _update_generation_task(
                task_id,
                {
                    "scene_description": scene_description,
                    "world_title": world_title,
                    "world_lore": world_lore,
                    "progress": 35,
                    "3d_service": preferred_3d_service,
                },
            )
        )

        _progress(self, task_id, song_id, 2, 48, f"Generating 3D model with {preferred_3d_service}")
        with tempfile.TemporaryDirectory() as temp_dir:
            local_model_path = os.path.join(temp_dir, "world.glb")
            success, model_message = False, "No 3D service available"

            # Try preferred service first
            if preferred_3d_service == "hunyuan_world":
                print(f"  Attempting HunyuanWorld...")
                success, model_message = run_async(
                    hunyuan_world_service.generate_model_from_prompt(
                        scene_description=scene_description,
                        mood=mood,
                        output_path=local_model_path,
                        colors=_scene_colors(song),
                    )
                )
                if not success:
                    print(f"  HunyuanWorld unavailable, falling back to TripoSR: {model_message}")

            # Fallback to TripoSR or try TripoSR if it was the preferred service
            if not success:
                print(f"  Using TripoSR...")
                success, model_message = run_async(
                    triposr_service.generate_model_from_prompt(
                        scene_description=scene_description,
                        mood=mood,
                        output_path=local_model_path,
                        colors=_scene_colors(song),
                    )
                )

            if not success:
                raise Exception(model_message)

            _progress(self, task_id, song_id, 3, 74, "Saving generated model locally")
            stored_model_path = run_async(local_storage_service.save_model(local_model_path, song_id))

        if not stored_model_path:
            raise Exception("Local model storage failed")

        model_url = run_async(local_storage_service.get_public_url(stored_model_path))

        _progress(self, task_id, song_id, 4, 88, "Creating local ambient audio")
        generated_music_url = run_async(
            music_service.generate_ambient_music(
                song_id=song_id,
                scene_description=scene_description,
                mood=mood,
            )
        )

        update_data = {
            "generationStatus": "succeeded",
            "generationProgress": 100,
            "modelUrl": model_url,
            "splatUrl": None,
            "generatedMusicUrl": generated_music_url or song.audioUrl,
            "scene3dDescription": scene_description,
            "worldLore": world_lore,
            "generatedAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }
        run_async(mongodb_service.update_song(song_id, update_data))
        run_async(
            _update_generation_task(
                task_id,
                {
                    "status": "succeeded",
                    "progress": 100,
                    "model_url": model_url,
                    "splat_url": None,
                    "music_url": generated_music_url or song.audioUrl,
                    "scene_description": scene_description,
                    "world_title": world_title,
                    "world_lore": world_lore,
                    "error": None,
                },
            )
        )

        print(f"✅ Local music world generation complete for {song_id}: {model_url}")
        return {
            "status": "succeeded",
            "song_id": song_id,
            "task_id": task_id,
            "model_url": model_url,
            "music_url": generated_music_url or song.audioUrl,
        }

    except Exception as exc:
        error = str(exc)
        print(f"Local music world generation failed: {error}")
        run_async(_mark_generation_failed(song_id, task_id, error))

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=45)
        return {"status": "failed", "song_id": song_id, "task_id": task_id, "error": error}


@app.task(bind=True, max_retries=1)
def generate_model_from_uploaded_image(
    self,
    task_id: str,
    image_path: str,
    song_id: str,
    user_id: str,
):
    """Generate a local model directly from an uploaded image."""
    try:
        run_async(_update_generation_task(task_id, {"status": "processing", "progress": 15}))

        with tempfile.TemporaryDirectory() as temp_dir:
            local_model_path = os.path.join(temp_dir, "uploaded-world.glb")
            success, message = run_async(
                triposr_service.generate_model_from_image(
                    image_path=image_path,
                    output_path=local_model_path,
                    fallback_seed=f"{task_id}:{song_id}",
                )
            )
            if not success:
                raise Exception(message)

            stored_model_path = run_async(local_storage_service.save_model(local_model_path, song_id))

        model_url = run_async(local_storage_service.get_public_url(stored_model_path))
        run_async(
            _update_generation_task(
                task_id,
                {
                    "status": "succeeded",
                    "progress": 100,
                    "model_url": model_url,
                    "error": None,
                },
            )
        )
        return {"status": "succeeded", "task_id": task_id, "model_url": model_url}
    except Exception as exc:
        error = str(exc)
        run_async(_update_generation_task(task_id, {"status": "failed", "error": error}))
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30)
        return {"status": "failed", "task_id": task_id, "error": error}
