"""Local TripoSR service with a procedural GLB fallback."""
import asyncio
import hashlib
import math
import random
import struct
import tempfile
from pathlib import Path
from typing import Optional, Tuple


class TripoSRService:
    """Local image-to-3D generation through TripoSR when installed."""

    def __init__(self):
        self.device = "cpu"
        self.model = None
        self.torch = None
        self.initialized = False
        self.available = False
        self.last_error: Optional[str] = None

        try:
            import torch

            self.torch = torch
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception as exc:
            self.last_error = f"torch unavailable: {exc}"

        print(f"TripoSR service ready for lazy init on {self.device}")

    async def initialize(self) -> bool:
        """Load TripoSR lazily. Returns False when the optional package is absent."""
        if self.initialized:
            return self.available

        self.initialized = True
        try:
            if self.torch is None:
                raise ImportError("torch is not installed")

            from tsr.system import TSR

            model = TSR.from_pretrained(
                "stabilityai/TripoSR",
                config_name="config.yaml",
                weight_name="model.ckpt",
            )
            model.renderer.set_chunk_size(8192)
            model.to(self.device)
            model.eval()

            self.model = model
            self.available = True
            self.last_error = None
            print("TripoSR model loaded successfully")
            return True
        except Exception as exc:
            self.model = None
            self.available = False
            self.last_error = str(exc)
            print(f"TripoSR unavailable, using procedural GLB fallback: {exc}")
            return False

    async def create_prompt_image(
        self,
        scene_description: str,
        mood: str,
        output_path: str,
        colors: Optional[dict] = None,
    ) -> str:
        """Create a deterministic prompt image that TripoSR can consume."""
        try:
            from PIL import Image, ImageDraw, ImageFilter
        except Exception:
            return ""

        palette = self._palette(colors, mood)
        rng = random.Random(self._seed(scene_description + mood))
        size = 512
        image = Image.new("RGB", (size, size), palette[0])
        draw = ImageDraw.Draw(image, "RGBA")

        for y in range(size):
            ratio = y / max(1, size - 1)
            top = self._hex_to_rgb(palette[0])
            bottom = self._hex_to_rgb(palette[1])
            color = tuple(int(top[i] * (1 - ratio) + bottom[i] * ratio) for i in range(3))
            draw.line([(0, y), (size, y)], fill=color)

        for _ in range(18):
            radius = rng.randint(26, 120)
            x = rng.randint(-40, size - 20)
            y = rng.randint(-20, size - 40)
            fill = self._hex_to_rgb(rng.choice(palette))
            draw.ellipse((x, y, x + radius, y + radius), fill=(*fill, rng.randint(32, 92)))

        center_x = size // 2
        base_y = int(size * 0.76)
        sides = 7
        for i in range(sides):
            angle = (i / sides) * math.tau
            width = rng.randint(34, 58)
            height = rng.randint(150, 260)
            x = center_x + int(math.cos(angle) * rng.randint(20, 88))
            color = self._hex_to_rgb(palette[(i + 2) % len(palette)])
            points = [
                (x, base_y - height),
                (x - width, base_y + rng.randint(-18, 30)),
                (x + width, base_y + rng.randint(-18, 30)),
            ]
            draw.polygon(points, fill=(*color, 220), outline=(255, 255, 255, 90))

        image = image.filter(ImageFilter.GaussianBlur(radius=0.35))
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path)
        return output_path

    async def generate_model_from_prompt(
        self,
        scene_description: str,
        mood: str,
        output_path: str,
        colors: Optional[dict] = None,
    ) -> Tuple[bool, str]:
        """Create a seed image, run TripoSR if available, otherwise write a GLB fallback."""
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = str(Path(temp_dir) / "seed.png")
            await self.create_prompt_image(scene_description, mood, image_path, colors)
            return await self.generate_model_from_image(
                image_path=image_path,
                output_path=output_path,
                fallback_seed=f"{scene_description}:{mood}",
                colors=colors,
            )

    async def generate_model_from_image(
        self,
        image_path: str,
        output_path: str,
        bake_texture: bool = True,
        fallback_seed: Optional[str] = None,
        colors: Optional[dict] = None,
    ) -> Tuple[bool, str]:
        """Generate a GLB model from an image using local TripoSR or fallback geometry."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        if await self.initialize() and self.model is not None and image_path:
            try:
                await asyncio.to_thread(self._run_triposr, image_path, output_path, bake_texture)
                size_mb = Path(output_path).stat().st_size / (1024 * 1024)
                return True, f"TripoSR generated {size_mb:.2f} MB GLB"
            except Exception as exc:
                self.last_error = str(exc)
                print(f"TripoSR generation failed, using procedural fallback: {exc}")

        seed = fallback_seed or image_path or output_path
        self._write_procedural_glb(output_path, seed, colors)
        size_mb = Path(output_path).stat().st_size / (1024 * 1024)
        return True, f"Procedural fallback generated {size_mb:.2f} MB GLB"

    async def generate_model_from_url(
        self,
        image_url: str,
        output_path: str,
        bake_texture: bool = True,
    ) -> Tuple[bool, str]:
        """Generate a model from an image URL."""
        import httpx

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()
            Path(tmp_path).write_bytes(response.content)
            return await self.generate_model_from_image(tmp_path, output_path, bake_texture)
        finally:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except Exception:
                pass

    def _run_triposr(self, image_path: str, output_path: str, bake_texture: bool) -> None:
        from PIL import Image

        image = Image.open(image_path).convert("RGB")
        with self.torch.no_grad():
            scene_codes = self.model([image], device=self.device)
            meshes = self.model.extract_mesh(
                scene_codes,
                has_vertex_color=bake_texture,
                resolution=256,
            )
        meshes[0].export(output_path)

    def _write_procedural_glb(self, output_path: str, seed_text: str, colors: Optional[dict]) -> None:
        rng = random.Random(self._seed(seed_text))
        palette = self._palette(colors, seed_text)
        vertices: list[tuple[float, float, float]] = []
        triangles: list[tuple[int, int, int]] = []

        grid = 22
        size = 16.0
        amp = 0.7 + rng.random() * 1.2
        freq = 0.35 + rng.random() * 0.35

        for z in range(grid + 1):
            for x in range(grid + 1):
                px = (x / grid - 0.5) * size
                pz = (z / grid - 0.5) * size
                y = math.sin(px * freq + rng.random() * 0.04) * math.cos(pz * freq) * amp
                y += math.sin((px + pz) * freq * 0.55) * amp * 0.35
                vertices.append((px, y - 1.4, pz))

        for z in range(grid):
            for x in range(grid):
                a = z * (grid + 1) + x
                b = a + 1
                c = a + (grid + 1)
                d = c + 1
                triangles.append((a, c, b))
                triangles.append((b, c, d))

        for i in range(9):
            angle = i / 9 * math.tau
            radius = 1.8 + rng.random() * 5.5
            cx = math.cos(angle) * radius
            cz = math.sin(angle) * radius
            height = 2.5 + rng.random() * 6.5
            base = -0.6 + rng.random() * 0.8
            self._add_cone(vertices, triangles, cx, cz, base, 0.45 + rng.random() * 0.75, height, 6 + i % 4)

        normals = self._compute_normals(vertices, triangles)
        flat_indices = [index for tri in triangles for index in tri]
        base_rgb = self._hex_to_rgb(palette[2])
        base_color = [channel / 255 for channel in base_rgb] + [1.0]
        emissive_rgb = self._hex_to_rgb(palette[3])
        emissive = [channel / 255 * 0.18 for channel in emissive_rgb]

        pos_blob = b"".join(struct.pack("<3f", *vertex) for vertex in vertices)
        norm_blob = b"".join(struct.pack("<3f", *normal) for normal in normals)
        idx_blob = b"".join(struct.pack("<H", index) for index in flat_indices)

        binary = bytearray()
        views = []

        def add_view(blob: bytes, target: int) -> int:
            while len(binary) % 4:
                binary.append(0)
            offset = len(binary)
            binary.extend(blob)
            views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(blob), "target": target})
            return len(views) - 1

        pos_view = add_view(pos_blob, 34962)
        norm_view = add_view(norm_blob, 34962)
        idx_view = add_view(idx_blob, 34963)
        while len(binary) % 4:
            binary.append(0)

        mins = [min(vertex[i] for vertex in vertices) for i in range(3)]
        maxs = [max(vertex[i] for vertex in vertices) for i in range(3)]
        gltf = {
            "asset": {"version": "2.0", "generator": "VirtuosoVision local procedural fallback"},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0, "name": "LocalMusicWorld"}],
            "meshes": [
                {
                    "primitives": [
                        {
                            "attributes": {"POSITION": 0, "NORMAL": 1},
                            "indices": 2,
                            "material": 0,
                        }
                    ]
                }
            ],
            "materials": [
                {
                    "name": "MoodMaterial",
                    "pbrMetallicRoughness": {
                        "baseColorFactor": base_color,
                        "metallicFactor": 0.18,
                        "roughnessFactor": 0.62,
                    },
                    "emissiveFactor": emissive,
                }
            ],
            "buffers": [{"byteLength": len(binary)}],
            "bufferViews": views,
            "accessors": [
                {
                    "bufferView": pos_view,
                    "componentType": 5126,
                    "count": len(vertices),
                    "type": "VEC3",
                    "min": mins,
                    "max": maxs,
                },
                {"bufferView": norm_view, "componentType": 5126, "count": len(vertices), "type": "VEC3"},
                {
                    "bufferView": idx_view,
                    "componentType": 5123,
                    "count": len(flat_indices),
                    "type": "SCALAR",
                },
            ],
        }

        import json

        json_blob = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        while len(json_blob) % 4:
            json_blob += b" "

        glb = bytearray()
        total_length = 12 + 8 + len(json_blob) + 8 + len(binary)
        glb.extend(struct.pack("<III", 0x46546C67, 2, total_length))
        glb.extend(struct.pack("<I4s", len(json_blob), b"JSON"))
        glb.extend(json_blob)
        glb.extend(struct.pack("<I4s", len(binary), b"BIN\0"))
        glb.extend(binary)

        Path(output_path).write_bytes(glb)

    def _add_cone(
        self,
        vertices: list[tuple[float, float, float]],
        triangles: list[tuple[int, int, int]],
        cx: float,
        cz: float,
        base_y: float,
        radius: float,
        height: float,
        sides: int,
    ) -> None:
        start = len(vertices)
        for i in range(sides):
            angle = i / sides * math.tau
            vertices.append((cx + math.cos(angle) * radius, base_y, cz + math.sin(angle) * radius))

        apex = len(vertices)
        vertices.append((cx, base_y + height, cz))
        center = len(vertices)
        vertices.append((cx, base_y - 0.04, cz))

        for i in range(sides):
            j = (i + 1) % sides
            triangles.append((start + i, start + j, apex))
            triangles.append((center, start + j, start + i))

    def _compute_normals(
        self,
        vertices: list[tuple[float, float, float]],
        triangles: list[tuple[int, int, int]],
    ) -> list[tuple[float, float, float]]:
        normals = [[0.0, 0.0, 0.0] for _ in vertices]

        for a, b, c in triangles:
            v0, v1, v2 = vertices[a], vertices[b], vertices[c]
            ux, uy, uz = v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]
            vx, vy, vz = v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]
            nx = uy * vz - uz * vy
            ny = uz * vx - ux * vz
            nz = ux * vy - uy * vx

            for index in (a, b, c):
                normals[index][0] += nx
                normals[index][1] += ny
                normals[index][2] += nz

        result = []
        for nx, ny, nz in normals:
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            result.append((nx / length, ny / length, nz / length))
        return result

    def _palette(self, colors: Optional[dict], mood: str) -> list[str]:
        if colors:
            values = [value for key, value in sorted(colors.items()) if isinstance(value, str) and value.startswith("#")]
            if len(values) >= 3:
                return values[:5]

        palettes = {
            "happy": ["#facc15", "#22c55e", "#06b6d4", "#f97316", "#ec4899"],
            "energetic": ["#ef4444", "#f97316", "#facc15", "#06b6d4", "#8b5cf6"],
            "sad": ["#1d4ed8", "#64748b", "#38bdf8", "#a78bfa", "#0f172a"],
            "calm": ["#0f766e", "#38bdf8", "#a7f3d0", "#6366f1", "#f0fdfa"],
            "dark": ["#111827", "#7c3aed", "#dc2626", "#334155", "#f59e0b"],
        }
        return palettes.get(str(mood).lower(), ["#06b6d4", "#8b5cf6", "#f97316", "#22c55e", "#ec4899"])

    def _hex_to_rgb(self, value: str) -> tuple[int, int, int]:
        value = value.strip().lstrip("#")
        if len(value) != 6:
            return (255, 255, 255)
        return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))

    def _seed(self, text: str) -> int:
        return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:16], 16)

    def get_status(self) -> dict:
        """Get service status without forcing a model load."""
        return {
            "initialized": self.initialized,
            "available": self.available,
            "device": self.device,
            "model_loaded": self.model is not None,
            "fallback": "procedural_glb",
            "last_error": self.last_error,
        }


triposr_service = TripoSRService()
