"""Local file storage service for generated media."""
import os
import shutil
from pathlib import Path
from typing import Optional

from app.config import get_settings


class LocalStorageService:
    """Manages local file storage for models, music, and assets."""

    def __init__(self):
        settings = get_settings()
        self.base_dir = Path(settings.LOCAL_STORAGE_DIR or os.getenv("LOCAL_STORAGE_DIR") or settings.MEDIA_DIR)
        self.models_dir = self.base_dir / "models"
        self.music_dir = self.base_dir / "music"
        self.images_dir = self.base_dir / "images"

        # Create directories
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.music_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(parents=True, exist_ok=True)

        # Public URL base (for serving files)
        self.public_url_base = (
            settings.LOCAL_STORAGE_URL
            or os.getenv("LOCAL_STORAGE_URL")
            or f"{settings.PUBLIC_API_URL.rstrip('/')}/media"
        )

        print(f"✅ Local storage initialized at {self.base_dir}")

    async def save_model(self, file_path: str, song_id: str) -> str:
        """
        Save a 3D model to local storage.

        Args:
            file_path: Local path to model file
            song_id: Song ID for organization

        Returns:
            Relative path in storage (e.g., "models/song123/model.glb")
        """
        try:
            dest_dir = self.models_dir / song_id
            dest_dir.mkdir(parents=True, exist_ok=True)

            filename = Path(file_path).name
            dest_path = dest_dir / filename

            # Copy file
            shutil.copy2(file_path, dest_path)

            # Return relative path
            relative_path = str(dest_path.relative_to(self.base_dir))
            print(f"✅ Model saved: {relative_path}")

            return relative_path
        except Exception as e:
            print(f"❌ Model save failed: {e}")
            return ""

    async def save_file(self, file_path: str, relative_dir: str, filename: Optional[str] = None) -> str:
        """Save any generated file under local storage and return its relative path."""
        try:
            dest_dir = self.base_dir / relative_dir
            dest_dir.mkdir(parents=True, exist_ok=True)

            dest_path = dest_dir / (filename or Path(file_path).name)
            shutil.copy2(file_path, dest_path)
            relative_path = str(dest_path.relative_to(self.base_dir))
            print(f"âœ… File saved: {relative_path}")
            return relative_path
        except Exception as e:
            print(f"âŒ File save failed: {e}")
            return ""

    async def save_music(self, file_path: str, song_id: str, suffix: str = "ambient") -> str:
        """Save music to local storage."""
        try:
            dest_dir = self.music_dir / song_id
            dest_dir.mkdir(parents=True, exist_ok=True)

            filename = Path(file_path).name
            name_parts = filename.rsplit(".", 1)
            new_filename = f"{name_parts[0]}-{suffix}.{name_parts[1]}" if len(name_parts) > 1 else filename

            dest_path = dest_dir / new_filename
            shutil.copy2(file_path, dest_path)

            relative_path = str(dest_path.relative_to(self.base_dir))
            print(f"✅ Music saved: {relative_path}")

            return relative_path
        except Exception as e:
            print(f"❌ Music save failed: {e}")
            return ""

    async def save_image(self, file_path: str, song_id: str, image_type: str = "thumbnail") -> str:
        """Save image to local storage."""
        try:
            dest_dir = self.images_dir / song_id
            dest_dir.mkdir(parents=True, exist_ok=True)

            filename = Path(file_path).name
            name_parts = filename.rsplit(".", 1)
            new_filename = f"{image_type}.{name_parts[1]}" if len(name_parts) > 1 else filename

            dest_path = dest_dir / new_filename
            shutil.copy2(file_path, dest_path)

            relative_path = str(dest_path.relative_to(self.base_dir))
            return relative_path
        except Exception as e:
            print(f"❌ Image save failed: {e}")
            return ""

    async def get_public_url(self, relative_path: str) -> str:
        """Get public URL for a stored file."""
        return f"{self.public_url_base}/{relative_path.replace(chr(92), '/')}"

    async def get_local_path(self, relative_path: str) -> str:
        """Get full local path from relative path."""
        return str(self.base_dir / relative_path)

    async def list_models(self, song_id: str) -> list:
        """List all models for a song."""
        song_dir = self.models_dir / song_id
        if not song_dir.exists():
            return []
        return [f.name for f in song_dir.glob("*.glb")]

    async def delete_model(self, relative_path: str) -> bool:
        """Delete a model file."""
        try:
            full_path = self.base_dir / relative_path
            if full_path.exists():
                full_path.unlink()
                print(f"✅ Deleted: {relative_path}")
                return True
            return False
        except Exception as e:
            print(f"❌ Delete failed: {e}")
            return False


# Singleton instance
local_storage_service = LocalStorageService()
