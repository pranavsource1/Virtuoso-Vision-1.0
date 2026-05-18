from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List
from datetime import datetime
from enum import Enum


class MoodEnum(str, Enum):
    HAPPY = "happy"
    SAD = "sad"
    ENERGETIC = "energetic"
    CALM = "calm"
    MELANCHOLIC = "melancholic"
    ETHEREAL = "ethereal"
    DARK = "dark"
    UPLIFTING = "uplifting"


class LyricSegment(BaseModel):
    """Individual lyric with timestamp"""
    text: str
    timestamp: float  # seconds
    confidence: float = 0.9


class AudioFeatures(BaseModel):
    """Extracted audio characteristics"""
    tempo: Optional[float] = None
    energy: float = Field(default=0.5, ge=0, le=1)
    danceability: float = Field(default=0.5, ge=0, le=1)
    loudness: Optional[float] = None
    speechiness: Optional[float] = None


class SceneParameters(BaseModel):
    """Procedural mathematical fingerprint — every float combination produces a unique world."""

    # === 5-Color Palette ===
    colors: dict = Field(default={
        "c1": "#06B6D4", "c2": "#8B5CF6", "c3": "#F97316",
        "c4": "#22C55E", "c5": "#EC4899"
    })

    # === Geometry ===
    geometryComplexity: float = Field(default=0.5, ge=0, le=1)    # subdivisions / detail level
    geometryDistortion: float = Field(default=0.3, ge=0, le=1)    # noise displacement amount
    geometrySharpness: float = Field(default=0.5, ge=0, le=1)     # angular vs organic
    geometryScale: float = Field(default=1.0, ge=0.3, le=3.0)     # size of central form
    symmetry: float = Field(default=0.5, ge=0, le=1)              # how symmetric the shape is

    # === Terrain / Ground ===
    terrainHeight: float = Field(default=0.4, ge=0, le=1)         # wave amplitude
    terrainFrequency: float = Field(default=0.5, ge=0, le=1)      # wave tightness
    terrainErosion: float = Field(default=0.3, ge=0, le=1)        # broken vs smooth

    # === Particles ===
    particleDensity: float = Field(default=0.5, ge=0, le=1)       # how many (maps to 500-5000)
    particleSize: float = Field(default=0.4, ge=0, le=1)          # size of each
    particleGravity: float = Field(default=0.0, ge=-1, le=1)      # -1=fall, 0=float, 1=rise
    particleTurbulence: float = Field(default=0.3, ge=0, le=1)    # chaos in movement
    particleSpread: float = Field(default=0.5, ge=0, le=1)        # distribution radius

    # === Atmosphere ===
    fogDensity: float = Field(default=0.3, ge=0, le=1)
    glowIntensity: float = Field(default=0.5, ge=0, le=1)         # bloom / emission
    noiseScale: float = Field(default=0.5, ge=0, le=1)            # perlin noise global scale

    # === Motion ===
    rotationSpeed: float = Field(default=0.4, ge=0, le=1)
    pulseIntensity: float = Field(default=0.3, ge=0, le=1)        # breathing / pulsing
    waveSpeed: float = Field(default=0.5, ge=0, le=1)             # terrain animation speed

    # === Material ===
    metalness: float = Field(default=0.3, ge=0, le=1)
    roughness: float = Field(default=0.4, ge=0, le=1)
    emissiveStrength: float = Field(default=0.5, ge=0, le=1)
    transparency: float = Field(default=0.1, ge=0, le=1)

    # === Camera ===
    cameraDistance: float = Field(default=0.5, ge=0, le=1)         # near vs far
    cameraHeight: float = Field(default=0.5, ge=0, le=1)          # low vs high angle

    # === Audio Reactivity ===
    bassReactivity: float = Field(default=0.6, ge=0, le=1)
    trebleReactivity: float = Field(default=0.4, ge=0, le=1)


class SongCreate(BaseModel):
    """Input: Create song from URL"""
    songUrl: HttpUrl
    title: Optional[str] = None
    artist: Optional[str] = None


class SongDB(BaseModel):
    """MongoDB document for songs"""
    id: Optional[str] = Field(default=None, alias="_id")
    userId: str
    title: str
    artist: Optional[str] = None
    songUrl: str
    audioUrl: str  # Downloaded/converted audio file URL or path
    thumbnailUrl: Optional[str] = None  # YouTube thumbnail or extracted image
    lyrics: List[LyricSegment] = []
    mood: MoodEnum
    audioFeatures: AudioFeatures
    visualDescription: str  # Ollama-generated description
    sceneParameters: SceneParameters
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    duration: float  # in seconds
    transcriptionStatus: str = "pending"  # pending, processing, completed, failed
    embeddings: Optional[List[float]] = None  # Stored in Supabase

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
        populate_by_name = True


class SongResponse(BaseModel):
    """Output: Song response"""
    id: str
    title: str
    artist: Optional[str] = None
    mood: str
    lyrics: List[LyricSegment]
    sceneParameters: SceneParameters
    visualDescription: str = ""
    audioUrl: str
    duration: float
    createdAt: str
