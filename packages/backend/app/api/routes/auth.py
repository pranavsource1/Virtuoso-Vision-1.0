from datetime import datetime

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr

from app.models import UserDB, UserResponse
from app.services.firebase_service import firebase_service
from app.services.mongodb_service import mongodb_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    displayName: str


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    return token.strip()


async def get_current_user(authorization: str = Header(None)) -> str:
    """Extract and verify the Firebase token, returning the Firebase UID."""
    token = _extract_bearer_token(authorization)

    try:
        firebase_service.initialize()
        decoded_token = firebase_service.verify_token(token)
        user_uid = decoded_token.get("uid")
        if not user_uid:
            raise ValueError("Firebase token did not include a uid claim")
        return user_uid
    except Exception as exc:
        print(f"Token verification failed: {exc}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/register")
async def register(payload: RegisterRequest, authorization: str = Header(None)):
    """Register or refresh a user profile in MongoDB after Firebase sign-in."""
    try:
        firebase_uid = await get_current_user(authorization)

        existing_user = await mongodb_service.get_user_by_firebase_uid(firebase_uid)
        if existing_user:
            return {
                "message": "User already registered",
                "userId": existing_user.id,
                "email": existing_user.email,
            }

        new_user = UserDB(
            firebaseUid=firebase_uid,
            email=payload.email,
            displayName=payload.displayName.strip() or "User",
        )
        user_id = await mongodb_service.create_user(new_user)

        return {
            "message": "User registered",
            "userId": user_id,
            "email": payload.email,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(authorization: str = Header(None)):
    """Get current user profile."""
    try:
        firebase_uid = await get_current_user(authorization)
        user = await mongodb_service.get_user_by_firebase_uid(firebase_uid)

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return UserResponse(
            id=user.id,
            email=user.email,
            displayName=user.displayName,
            profilePicture=user.profilePicture,
            bio=user.bio,
            createdAt=user.createdAt.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/debug/uid")
async def debug_firebase_uid(authorization: str = Header(None)):
    """Debug endpoint to get the current Firebase UID."""
    try:
        firebase_uid = await get_current_user(authorization)
        return {
            "firebaseUid": firebase_uid,
            "serverTime": datetime.utcnow().isoformat(),
        }
    except HTTPException as exc:
        return {"error": exc.detail}
    except Exception as exc:
        return {"error": str(exc)}
