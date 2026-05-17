from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class VisionCreate(BaseModel):
    """Input: Save/create a vision"""
    songId: str
    name: Optional[str] = None


class VisionUpdate(BaseModel):
    """Input: Update saved vision fields"""
    name: Optional[str] = None
    favorited: Optional[bool] = None


class VisionDB(BaseModel):
    """MongoDB document for visions (user's saved experiences)"""
    id: Optional[str] = Field(default=None, alias="_id")
    userId: str
    songId: str
    name: str
    mood: Optional[str] = None
    thumbnail: Optional[str] = None
    playCount: int = 0
    favorited: bool = False
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
        populate_by_name = True


class VisionResponse(BaseModel):
    """Output: Vision response"""
    id: str
    songId: str
    name: str
    mood: Optional[str] = None
    thumbnail: Optional[str] = None
    playCount: int
    favorited: bool
    createdAt: str
