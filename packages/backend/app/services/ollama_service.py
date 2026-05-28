"""Ollama AI service for local LLM inference."""
import logging
from typing import Any, Dict, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class OllamaService:
    """Small async client for the local Ollama server."""

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.OLLAMA_API_URL.rstrip("/")
        self.default_model = settings.OLLAMA_MODEL
        self.timeout = 300.0
        logger.info("Ollama service initialized at %s with model %s", self.base_url, self.default_model)

    async def health_check(self) -> bool:
        """Check whether Ollama is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
            return True
        except Exception as exc:
            logger.warning("Ollama health check failed: %s", exc)
            return False

    async def list_models(self) -> list[str]:
        """List locally available Ollama model names."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
            return [model.get("name", "") for model in response.json().get("models", []) if model.get("name")]
        except Exception as exc:
            logger.warning("Failed to list Ollama models: %s", exc)
            return []

    async def generate_text(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1200,
    ) -> str:
        """Generate text through Ollama's local chat endpoint."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": model or self.default_model,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": max_tokens,
                        },
                    },
                )
                response.raise_for_status()

            return response.json().get("message", {}).get("content", "").strip()
        except Exception as exc:
            logger.warning("Ollama generation failed: %s", exc)
            return ""

    async def enhance_scene_description(self, user_description: str) -> str:
        """Enhance a scene description for local image-to-3D generation."""
        system_prompt = (
            "You are a 3D world designer. Expand music visualization notes into a concise, "
            "specific scene prompt for image-to-3D generation. Include subject, materials, "
            "lighting, palette, and spatial composition. Return only the prompt."
        )

        prompt = f'Enhance this scene for 3D generation:\n"{user_description}"'
        result = await self.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.75,
            max_tokens=450,
        )
        return result or user_description

    async def generate_world_title_and_description(
        self,
        music_mood: str,
        user_prompt: Optional[str] = None,
    ) -> Dict[str, str]:
        """Generate a local title and 3D world description for a song."""
        system_prompt = (
            "You design interactive music-reactive 3D worlds. Respond in exactly three lines:\n"
            "TITLE: a vivid 2-5 word title\n"
            "DESCRIPTION: a concrete 2-3 sentence 3D scene description\n"
            "LORE: a short 2-sentence lore or history of the generated world"
        )
        prompt = f"Music mood: {music_mood}\nExisting visual notes: {user_prompt or 'none'}"
        response = await self.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.85,
            max_tokens=350,
        )

        title = "Local Music World"
        description = user_prompt or "A vivid music-reactive environment shaped by the song."
        lore = "An ethereal realm born from the echoes of forgotten melodies."

        for line in response.splitlines():
            upper = line.upper()
            if upper.startswith("TITLE:"):
                title = line.split(":", 1)[1].strip() or title
            elif upper.startswith("DESCRIPTION:"):
                description = line.split(":", 1)[1].strip() or description
            elif upper.startswith("LORE:"):
                lore = line.split(":", 1)[1].strip() or lore

        return {"title": title, "description": description, "lore": lore}

    async def generate_music_prompt(self, scene_description: str) -> str:
        """Generate a short local music prompt from a scene description."""
        result = await self.generate_text(
            prompt=f"Write a concise ambient music prompt for this 3D scene:\n{scene_description}",
            system_prompt="You are a music producer. Keep it under 40 words.",
            temperature=0.7,
            max_tokens=100,
        )
        return result or "cinematic ambient, spacious, gentle evolving texture"

    async def classify_mood_from_text(self, text: str) -> str:
        """Classify a text snippet into a short mood descriptor."""
        result = await self.generate_text(
            prompt=f'Classify this content into one short music mood:\n"{text[:700]}"',
            system_prompt="Return only one to three words.",
            temperature=0.3,
            max_tokens=20,
        )
        return result.strip() or "ambient"


ollama_service = OllamaService()
