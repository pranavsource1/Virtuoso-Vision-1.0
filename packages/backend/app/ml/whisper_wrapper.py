import torch
from transformers import pipeline
from typing import List, Tuple, Optional
from app.models import LyricSegment
from app.config import get_settings


class WhisperService:
    """Whisper transcription using local HuggingFace model (no API key needed)"""

    _pipeline = None  # Class-level singleton to avoid reloading

    def __init__(self):
        self.settings = get_settings()

    @classmethod
    def _get_pipeline(cls):
        """Lazy-load the Whisper pipeline (singleton)"""
        if cls._pipeline is None:
            print("🔄 Loading Whisper model (first time, may take a moment)...")
            device = "cuda" if torch.cuda.is_available() else "cpu"
            cls._pipeline = pipeline(
                "automatic-speech-recognition",
                model="openai/whisper-base",
                device=device,
                chunk_length_s=30,
            )
            print(f"✅ Whisper model loaded on {device}")
        return cls._pipeline

    async def transcribe_audio(self, audio_path: str) -> Tuple[List[LyricSegment], str]:
        """Transcribe audio file using local Whisper model via HuggingFace transformers"""
        try:
            pipe = self._get_pipeline()

            # Transcribe with timestamps
            result = pipe(
                audio_path,
                return_timestamps=True,
                generate_kwargs={"language": "en"},
            )

            segments = []
            full_text = ""

            if "chunks" in result and result["chunks"]:
                for chunk in result["chunks"]:
                    text = chunk.get("text", "").strip()
                    timestamps = chunk.get("timestamp", (0.0, 0.0))
                    start_time = timestamps[0] if timestamps[0] is not None else 0.0

                    if text:
                        lyric = LyricSegment(
                            text=text,
                            timestamp=start_time,
                            confidence=0.9,
                        )
                        segments.append(lyric)
                        full_text += text + " "
            elif "text" in result:
                # Fallback: no chunks, just full text
                full_text = result["text"].strip()
                segments = [LyricSegment(text=full_text, timestamp=0.0)]

            print(f"✅ Transcribed {len(segments)} segments ({len(full_text)} chars)")
            return segments, full_text.strip()

        except Exception as e:
            print(f"❌ Whisper transcription failed: {e}")
            import traceback
            traceback.print_exc()
            return [], ""
