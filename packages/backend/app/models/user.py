from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    """Input: Create user"""
    email: EmailStr
    displayName: str


class UserDB(BaseModel):
    """MongoDB document for users"""
    id: Optional[str] = Field(default=None, alias="_id")
    firebaseUid: str  # From Firebase auth
    email: str
    displayName: str
    profilePicture: Optional[str] = None
    bio: Optional[str] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    preferences: dict = Field(default={"language": "en", "theme": "dark"})

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
        populate_by_name = True


class UserResponse(BaseModel):
    """Output: User response"""
    id: str
    email: str
    displayName: str
    profilePicture: Optional[str] = None
    bio: Optional[str] = None
    createdAt: str
