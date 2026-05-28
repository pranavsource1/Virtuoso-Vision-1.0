import httpx
import json
from typing import Optional
from app.config import get_settings
from app.models import SceneParameters


def _validate_color(hex_str: str) -> bool:
    if not isinstance(hex_str, str) or not hex_str.startswith("#") or len(hex_str) != 7:
        return False
    try:
        r, g, b = int(hex_str[1:3], 16), int(hex_str[3:5], 16), int(hex_str[5:7], 16)
        return (0.299 * r + 0.587 * g + 0.114 * b) > 20
    except ValueError:
        return False


def _get_fallback_params(lyrics_hash: int) -> SceneParameters:
    """Generate deterministic but unique defaults from a hash of the lyrics."""
    import hashlib
    h = abs(lyrics_hash)
    def f(offset, lo=0.0, hi=1.0):
        return lo + ((h >> offset) % 1000) / 999.0 * (hi - lo)

    hues = [int(f(i * 3, 0, 360)) for i in range(5)]
    cols = {f"c{i+1}": f"#{int(128 + 127 * __import__('math').sin(__import__('math').radians(hue))):02x}"
                        f"{int(128 + 127 * __import__('math').sin(__import__('math').radians(hue + 120))):02x}"
                        f"{int(128 + 127 * __import__('math').sin(__import__('math').radians(hue + 240))):02x}"
            for i, hue in enumerate(hues)}

    return SceneParameters(
        colors=cols,
        geometryComplexity=f(0), geometryDistortion=f(3), geometrySharpness=f(6),
        geometryScale=f(9, 0.5, 2.5), symmetry=f(12),
        terrainHeight=f(15), terrainFrequency=f(18), terrainErosion=f(21),
        particleDensity=f(24), particleSize=f(27), particleGravity=f(30, -1, 1),
        particleTurbulence=f(33), particleSpread=f(36),
        fogDensity=f(39, 0.1, 0.6), glowIntensity=f(42), noiseScale=f(45),
        rotationSpeed=f(48), pulseIntensity=f(51), waveSpeed=f(54),
        metalness=f(57), roughness=f(60), emissiveStrength=f(63),
        transparency=f(2, 0, 0.5), cameraDistance=f(5, 0.3, 0.8),
        cameraHeight=f(8, 0.3, 0.7), bassReactivity=f(11, 0.3, 0.9),
        trebleReactivity=f(14, 0.2, 0.7),
    )


class OllamaService:
    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.OLLAMA_API_URL
        self.model = "mistral"

    async def _generate(self, prompt: str, temperature: float = 0.7) -> Optional[str]:
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={"model": self.model, "prompt": prompt, "stream": False, "temperature": temperature}
                )
                response.raise_for_status()
                return response.json().get("response", "").strip()
        except httpx.ConnectError as e:
            print(f"❌ Ollama connection failed: Cannot reach {self.base_url} - {e}")
            print(f"   TIP: Ensure Ollama is running (ollama serve) on the configured URL")
            return None
        except httpx.TimeoutException as e:
            print(f"❌ Ollama timeout: Server at {self.base_url} took too long - {e}")
            print(f"   TIP: Ollama may be overloaded or downloading a model")
            return None
        except Exception as e:
            print(f"❌ Ollama generation failed: {type(e).__name__}: {e}")
            return None

    async def generate_scene_parameters(
        self, mood: str, visual_description: str, song_title: str, artist: str, vibe_prompt: str = ""
    ) -> Optional[SceneParameters]:
        """Generate a unique mathematical fingerprint for this specific song."""

        vibe_instruction = f'IMPORTANT - The user has specifically requested this vibe: "{vibe_prompt}"\nYou MUST let this vision heavily influence your choices for mood, colors, terrain, water, structures, and sky.' if vibe_prompt else ''

        prompt = f"""You are a synesthete — someone who literally SEES music as shapes, colors, and movement.

You are listening to "{song_title}" by {artist}.
The mood is: {mood}
The visual world you see: {visual_description}
{vibe_instruction}

Your task: Convert what you see and feel into EXACT mathematical parameters that will drive a procedural 3D world. Every number you choose makes the visualization unique to THIS specific song.

Return ONLY valid JSON with these fields (all floats between 0.0 and 1.0 unless noted):

{{
  "colors": {{
    "c1": "#RRGGBB",
    "c2": "#RRGGBB",
    "c3": "#RRGGBB",
    "c4": "#RRGGBB",
    "c5": "#RRGGBB"
  }},
  "geometryComplexity": 0.5,
  "geometryDistortion": 0.3,
  "geometrySharpness": 0.5,
  "geometryScale": 1.0,
  "symmetry": 0.5,
  "terrainHeight": 0.4,
  "terrainFrequency": 0.5,
  "terrainErosion": 0.3,
  "particleDensity": 0.5,
  "particleSize": 0.4,
  "particleGravity": 0.0,
  "particleTurbulence": 0.3,
  "particleSpread": 0.5,
  "fogDensity": 0.3,
  "glowIntensity": 0.5,
  "noiseScale": 0.5,
  "rotationSpeed": 0.4,
  "pulseIntensity": 0.3,
  "waveSpeed": 0.5,
  "metalness": 0.3,
  "roughness": 0.4,
  "emissiveStrength": 0.5,
  "transparency": 0.1,
  "cameraDistance": 0.5,
  "cameraHeight": 0.5,
  "bassReactivity": 0.6,
  "trebleReactivity": 0.4,
  "terrainStyle": "mountains",
  "waterType": "calm_lake",
  "structureType": "monoliths",
  "skyAtmosphere": "starry_space"
}}

GUIDANCE (think deeply about the song before choosing):
- geometryComplexity: Aggressive/complex songs → 0.7-1.0. Simple/minimal songs → 0.1-0.3.
- geometryDistortion: Chaotic/distorted sounds → 0.7-1.0. Clean/pure melodies → 0.0-0.2.
- geometrySharpness: Hard beats/anger → 0.8-1.0. Soft/dreamy → 0.0-0.2.
- geometryScale: Epic/grand songs → 2.0-3.0. Intimate/quiet → 0.3-0.7. (Range: 0.3-3.0)
- symmetry: Structured pop → 0.8-1.0. Freeform jazz/experimental → 0.0-0.3.
- terrainHeight: Dramatic dynamic range → 0.7-1.0. Flat/monotone → 0.0-0.2.
- terrainFrequency: Fast tempo/complex rhythm → 0.7-1.0. Slow/sparse → 0.1-0.3.
- particleGravity: Rain/sadness/weight → -0.8. Rising hope/euphoria → 0.8. Floating → 0.0. (Range: -1.0 to 1.0)
- particleTurbulence: Chaos/energy → 0.8-1.0. Peace/calm → 0.0-0.2.
- fogDensity: Mystery/atmosphere → 0.5-0.8. Clarity/brightness → 0.0-0.2.
- glowIntensity: Ethereal/spiritual → 0.8-1.0. Raw/gritty → 0.1-0.3.
- metalness: Industrial/electronic → 0.7-1.0. Organic/acoustic → 0.0-0.2.
- emissiveStrength: Energetic/bright → 0.7-1.0. Dark/subdued → 0.1-0.3.
- bassReactivity: Bass-heavy genres (trap, EDM) → 0.8-1.0. Vocal-focused → 0.2-0.4.
- trebleReactivity: Bright instruments (synths, hi-hats) → 0.7-1.0. Deep/bass-only → 0.1-0.3.

STYLES:
- terrainStyle: one of ["mountains", "flatlands", "canyons", "floating_islands"]
- waterType: one of ["calm_lake", "lava", "stormy_ocean", "digital_grid", "none"]
- structureType: one of ["crystals", "monoliths", "ruins", "neon_pillars", "none"]
- skyAtmosphere: one of ["starry_space", "sunset", "dark_abyss", "aurora"]

COLORS: Choose 5 colors that capture the SPECIFIC emotional palette of THIS song.
- NOT generic mood colors. Think: what exact colors flash in your mind when you hear these lyrics?
- All colors must be vibrant (never black #000000 or near-black).

Return ONLY the JSON. No explanation."""

        response_text = await self._generate(prompt, temperature=0.4)

        # Hash the lyrics for deterministic fallback
        lyrics_hash = hash(f"{song_title}{artist}{mood}{visual_description}")

        if not response_text:
            print(f"⚠️ Ollama empty response — generating hash-based fallback")
            return _get_fallback_params(lyrics_hash)

        try:
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            params = json.loads(response_text)

            # Validate colors
            colors = params.get("colors", {})
            defaults = ["#06B6D4", "#8B5CF6", "#F97316", "#22C55E", "#EC4899"]
            for i, key in enumerate(["c1", "c2", "c3", "c4", "c5"]):
                if not _validate_color(colors.get(key, "")):
                    colors[key] = defaults[i]
            params["colors"] = colors

            # Clamp all float fields
            for field in ["geometryComplexity", "geometryDistortion", "geometrySharpness",
                          "symmetry", "terrainHeight", "terrainFrequency", "terrainErosion",
                          "particleDensity", "particleSize", "particleTurbulence",
                          "particleSpread", "fogDensity", "glowIntensity", "noiseScale",
                          "rotationSpeed", "pulseIntensity", "waveSpeed",
                          "metalness", "roughness", "emissiveStrength", "transparency",
                          "cameraDistance", "cameraHeight", "bassReactivity", "trebleReactivity"]:
                if field in params:
                    params[field] = max(0.0, min(1.0, float(params[field])))

            if "geometryScale" in params:
                params["geometryScale"] = max(0.3, min(3.0, float(params["geometryScale"])))
            if "particleGravity" in params:
                params["particleGravity"] = max(-1.0, min(1.0, float(params["particleGravity"])))

            # Validate string styles
            valid_terrain = ["mountains", "flatlands", "canyons", "floating_islands"]
            if params.get('terrainStyle') not in valid_terrain:
                params['terrainStyle'] = "mountains"
            
            valid_water = ["calm_lake", "lava", "stormy_ocean", "digital_grid", "none"]
            if params.get('waterType') not in valid_water:
                params['waterType'] = "calm_lake"
            
            valid_structure = ["crystals", "monoliths", "ruins", "neon_pillars", "none"]
            if params.get('structureType') not in valid_structure:
                params['structureType'] = "monoliths"
            
            valid_sky = ["starry_space", "sunset", "dark_abyss", "aurora"]
            if params.get('skyAtmosphere') not in valid_sky:
                params['skyAtmosphere'] = "starry_space"

            return SceneParameters(**params)
        except Exception as e:
            print(f"❌ Parse failed: {e}\nResponse: {response_text}")
            return _get_fallback_params(lyrics_hash)

    async def generate_visual_prompt(self, lyrics: str, mood: str) -> Optional[str]:
        prompt = f"""You are a synesthete who sees vivid, unique worlds when listening to music.

Read these lyrics and let them paint a picture in your mind:

Lyrics: {lyrics}
Mood: {mood}

Describe the SPECIFIC world you see. Not generic — describe what makes THIS song's world different from any other.
- What unique landscape forms? (not just "mountains" — what KIND? crystal spires? obsidian cliffs? floating meadows?)
- What fills the air? (not just "particles" — golden pollen? electric sparks? falling ash? luminous jellyfish?)
- What textures and materials dominate? (liquid chrome? rough stone? translucent ice? living vines?)
- What is the light doing? (pulsing from below? scattered through prisms? flickering like dying stars?)
- What emotion physically manifests in this world?

Write 3-4 sentences of extremely vivid, specific, unique imagery. Return ONLY the description."""

        return await self._generate(prompt, temperature=0.9)

    async def generate_mood_analysis(self, lyrics: str, audio_features: dict) -> Optional[str]:
        features_str = ", ".join([f"{k}: {v}" for k, v in audio_features.items()])
        prompt = f"""Analyze the mood of this song based on lyrics and audio features.
Lyrics: {lyrics}
Audio Features: {features_str}
Return a single-line mood description. Be concise. Return ONLY the mood description."""
        return await self._generate(prompt, temperature=0.7)

    async def health_check(self) -> bool:
        """Check if Ollama is running and accessible."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
                models = data.get("models", [])
                print(f"✅ Ollama is running at {self.base_url}")
                if models:
                    print(f"   Available models: {', '.join([m.get('name', 'unknown') for m in models])}")
                return True
        except httpx.ConnectError:
            print(f"❌ Ollama not running: Cannot connect to {self.base_url}")
            return False
        except httpx.TimeoutException:
            print(f"❌ Ollama timeout: {self.base_url} not responding within 5s")
            return False
        except Exception as e:
            print(f"❌ Ollama health check failed: {e}")
            return False

    async def ensure_model(self, model_name: str = None) -> bool:
        if model_name is None:
            model_name = self.model
        try:
            # Check if model is already loaded
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                models = response.json().get("models", [])
                if any(m.get("name") == model_name for m in models):
                    print(f"✅ Model '{model_name}' already loaded")
                    return True

            # Model not found, pull it
            print(f"📥 Pulling model '{model_name}'... (this may take a few minutes)")
            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/pull",
                    json={"name": model_name},
                    timeout=600.0
                )
                response.raise_for_status()
                print(f"✅ Model '{model_name}' is ready")
                return True
        except Exception as e:
            print(f"⚠️  Failed to pull model '{model_name}': {e}")
            print(f"   System will use procedural fallback for visuals")
            return False


ollama_service = OllamaService()
