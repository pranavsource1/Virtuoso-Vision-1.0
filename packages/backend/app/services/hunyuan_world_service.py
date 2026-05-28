"""Open-source HunyuanWorld 3D generation service (local inference, completely free)."""
import asyncio
import os
import tempfile
from pathlib import Path
from typing import Optional, Tuple


class HunyuanWorldService:
    """Local HunyuanWorld for text-to-3D generation (free, open-source)."""

    def __init__(self):
        self.device = "cpu"
        self.torch = None
        self.model = None
        self.initialized = False
        self.available = False
        self.last_error: Optional[str] = None

        try:
            import torch
            self.torch = torch
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception as exc:
            self.last_error = f"torch unavailable: {exc}"

        print(f"HunyuanWorld service ready for lazy init on {self.device}")

    async def initialize(self) -> bool:
        """Load HunyuanWorld lazily. Returns False when unavailable."""
        if self.initialized:
            return self.available

        self.initialized = True
        try:
            # Try importing HunyuanWorld
            from hunyuan_world import HunyuanWorld

            # Initialize model (downloads on first run)
            self.model = HunyuanWorld(
                device=self.device,
                dtype="float16" if self.device == "cuda" else "float32"
            )
            self.available = True
            self.last_error = None
            print("✅ HunyuanWorld model loaded successfully")
            return True
        except ImportError:
            self.last_error = "hunyuan-world package not installed (optional) - using TripoSR fallback"
            print(f"⚠️  HunyuanWorld unavailable: {self.last_error}")
            return False
        except Exception as exc:
            self.model = None
            self.available = False
            self.last_error = str(exc)
            print(f"⚠️  HunyuanWorld init failed, using fallback: {exc}")
            return False

    async def generate_model_from_prompt(
        self,
        scene_description: str,
        mood: str = "ambient",
        output_path: str = "",
        colors: Optional[dict] = None,
    ) -> Tuple[bool, str]:
        """
        Generate a 3D GLB model from text description using HunyuanWorld.
        Falls back gracefully if not available.
        """
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        if await self.initialize() and self.model is not None:
            try:
                # Enhance prompt for better results
                enhanced_prompt = f"{scene_description}. Mood: {mood}. High quality, detailed, 3D model suitable for interactive visualization."

                print(f"🎨 HunyuanWorld generating: {enhanced_prompt[:80]}...")

                # Generate using HunyuanWorld (async wrapper)
                glb_data = await asyncio.to_thread(
                    self._generate_mesh,
                    enhanced_prompt
                )

                if glb_data:
                    Path(output_path).write_bytes(glb_data)
                    size_mb = Path(output_path).stat().st_size / (1024 * 1024)
                    return True, f"HunyuanWorld generated {size_mb:.2f} MB GLB model"
                else:
                    raise Exception("Model generation returned empty data")

            except Exception as exc:
                self.last_error = str(exc)
                print(f"❌ HunyuanWorld generation failed: {exc}")
                return False, f"HunyuanWorld failed: {str(exc)}"

        return False, "HunyuanWorld not available - use TripoSR service"

    def _generate_mesh(self, prompt: str) -> Optional[bytes]:
        """Internal: Generate mesh data (runs in thread pool)."""
        try:
            # HunyuanWorld API varies by version - this is a template
            # Replace with actual HunyuanWorld API calls
            mesh = self.model.generate(
                text_prompt=prompt,
                num_inference_steps=50,
                guidance_scale=7.5,
            )

            # Export to GLB format
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as tmp:
                mesh.export(tmp.name)
                with open(tmp.name, "rb") as f:
                    return f.read()
        except Exception as exc:
            print(f"Mesh generation error: {exc}")
            return None

    def get_status(self) -> dict:
        """Get service status without forcing model load."""
        return {
            "initialized": self.initialized,
            "available": self.available,
            "device": self.device,
            "model_loaded": self.model is not None,
            "type": "hunyuan_world",
            "last_error": self.last_error,
        }


hunyuan_world_service = HunyuanWorldService()
