"""Gaussian Splat service for PLY file handling and metadata extraction."""
import os
import struct
from typing import Optional, Dict, Any, List, Tuple


class SplatService:
    """Manages Gaussian Splat PLY files and metadata."""

    def __init__(self):
        self.enabled = True
        print(f"✅ Splat service initialized (PLY parsing ready)")

    async def parse_ply_header(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Parse PLY file header to extract format info.

        Args:
            file_path: Path to PLY file

        Returns:
            {
                "format": "binary_little_endian" | "ascii",
                "vertex_count": int,
                "properties": [...],
                "has_normals": bool,
                "has_colors": bool
            }
        """
        try:
            with open(file_path, "rb") as f:
                # Read magic bytes
                magic = f.read(3)
                if magic != b"ply":
                    print(f"❌ Invalid PLY file (missing magic bytes)")
                    return None

                # Read until end_header
                header_end = False
                format_type = "ascii"
                vertex_count = 0
                properties = []

                while not header_end:
                    line = f.readline().decode("utf-8").strip()

                    if line.startswith("format"):
                        format_type = line.split()[-1]

                    elif line.startswith("element vertex"):
                        vertex_count = int(line.split()[-1])

                    elif line.startswith("property"):
                        properties.append(line)

                    elif line == "end_header":
                        header_end = True

                metadata = {
                    "format": format_type,
                    "vertex_count": vertex_count,
                    "properties": properties,
                    "has_normals": any("normal" in p for p in properties),
                    "has_colors": any(any(c in p for c in ["red", "green", "blue", "rgb"]) for p in properties),
                }

                print(f"✅ Parsed PLY header: {vertex_count} vertices")
                return metadata

        except Exception as e:
            print(f"❌ PLY header parsing error: {e}")
            return None

    async def get_splat_bounds(self, header: Dict[str, Any]) -> Dict[str, float]:
        """
        Estimate bounds of Gaussian Splat from header metadata.
        (Actual bounds would require full file parsing)

        Args:
            header: PLY header metadata

        Returns:
            {
                "min_x": float, "max_x": float,
                "min_y": float, "max_y": float,
                "min_z": float, "max_z": float
            }
        """
        # Placeholder - real calculation requires parsing vertices
        # This is used for physics collider generation fallback
        return {
            "min_x": -10.0,
            "max_x": 10.0,
            "min_y": -10.0,
            "max_y": 10.0,
            "min_z": -10.0,
            "max_z": 10.0
        }

    async def generate_splat_metadata(
        self,
        ply_path: str,
        scene_description: str
    ) -> Optional[Dict[str, Any]]:
        """
        Generate metadata for a Gaussian Splat file.

        Args:
            ply_path: Path to PLY file
            scene_description: Scene description for context

        Returns:
            Metadata dict for rendering and physics
        """
        try:
            header = await self.parse_ply_header(ply_path)
            if not header:
                return None

            bounds = await self.get_splat_bounds(header)

            metadata = {
                "file_path": ply_path,
                "format": header["format"],
                "vertex_count": header["vertex_count"],
                "has_normals": header["has_normals"],
                "has_colors": header["has_colors"],
                "bounds": bounds,
                "scene_description": scene_description,
                "file_size": os.path.getsize(ply_path),
            }

            return metadata

        except Exception as e:
            print(f"❌ Splat metadata generation error: {e}")
            return None

    async def estimate_collider_from_bounds(
        self,
        bounds: Dict[str, float]
    ) -> Dict[str, Any]:
        """
        Generate a cuboid physics collider from splat bounds.
        Used as fallback when real 3D geometry is unavailable.

        Args:
            bounds: Bounding box from splat

        Returns:
            Collider definition for Rapier
        """
        hx = (bounds["max_x"] - bounds["min_x"]) / 2
        hy = (bounds["max_y"] - bounds["min_y"]) / 2
        hz = (bounds["max_z"] - bounds["min_z"]) / 2

        return {
            "type": "cuboid",
            "half_extents": [hx, hy, hz],
            "center": [
                (bounds["max_x"] + bounds["min_x"]) / 2,
                (bounds["max_y"] + bounds["min_y"]) / 2,
                (bounds["max_z"] + bounds["min_z"]) / 2,
            ]
        }


# Singleton instance
splat_service = SplatService()
