import firebase_admin
from firebase_admin import credentials, auth
import inspect
from typing import Optional, Dict, Any
from app.config import get_settings


class FirebaseService:
    def __init__(self):
        self.settings = get_settings()
        self.app: Optional[firebase_admin.App] = None

    def initialize(self):
        """Initialize Firebase Admin SDK (idempotent - safe to call multiple times)"""
        # Already initialized — reuse existing app
        if self.app is not None:
            return

        # Check if another instance already initialized the default app
        if firebase_admin._apps:
            self.app = firebase_admin.get_app()
            return

        if not all([
            self.settings.FIREBASE_PROJECT_ID,
            self.settings.FIREBASE_PRIVATE_KEY,
            self.settings.FIREBASE_CLIENT_EMAIL
        ]):
            print("⚠️  Firebase credentials not fully configured")
            return

        try:
            # Create credential from environment variables
            cred_dict = {
                "type": "service_account",
                "project_id": self.settings.FIREBASE_PROJECT_ID,
                "private_key": self.settings.FIREBASE_PRIVATE_KEY.replace('\\n', '\n'),
                "client_email": self.settings.FIREBASE_CLIENT_EMAIL,
                "client_id": self.settings.FIREBASE_CLIENT_ID,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            }

            cred = credentials.Certificate(cred_dict)
            self.app = firebase_admin.initialize_app(cred)
            print("✅ Firebase initialized successfully")
        except Exception as e:
            print(f"❌ Firebase initialization failed: {e}")

    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify Firebase ID token with clock-skew tolerance for Docker/WSL2."""
        if not self.app:
            raise Exception("Firebase not initialized")

        try:
            decoded_token = auth.verify_id_token(token, check_revoked=False)
            return decoded_token
        except Exception as e:
            error_msg = str(e)

            # Handle Docker ↔ Host clock drift ("Token used too early, X < Y")
            if "used too early" in error_msg:
                import re, time
                match = re.search(r'(\d+)\s*<\s*(\d+)', error_msg)
                if match:
                    token_time, server_time = int(match.group(1)), int(match.group(2))
                    drift = server_time - token_time
                    if 0 < drift <= 30:
                        print(f"⏳ Clock skew detected ({drift}s). Waiting and retrying...")
                        time.sleep(drift + 1)
                        try:
                            decoded_token = auth.verify_id_token(token, check_revoked=False)
                            print(f"✅ Token verified after waiting for clock skew ({drift}s)")
                            return decoded_token
                        except Exception as retry_err:
                            raise Exception(f"Token verification failed after clock-skew retry: {retry_err}")

            raise Exception(f"Token verification failed: {error_msg}")

    def get_user(self, uid: str) -> Dict[str, Any]:
        """Get Firebase user by UID"""
        if not self.app:
            raise Exception("Firebase not initialized")

        try:
            user = auth.get_user(uid)
            return {
                "uid": user.uid,
                "email": user.email,
                "display_name": user.display_name,
                "photo_url": user.photo_url,
                "email_verified": user.email_verified,
            }
        except Exception as e:
            raise Exception(f"Failed to get user: {str(e)}")

    def create_user(self, email: str, password: str, display_name: str = "") -> str:
        """Create a new Firebase user"""
        if not self.app:
            raise Exception("Firebase not initialized")

        try:
            user = auth.create_user(
                email=email,
                password=password,
                display_name=display_name
            )
            return user.uid
        except Exception as e:
            raise Exception(f"Failed to create user: {str(e)}")

    def delete_user(self, uid: str):
        """Delete a Firebase user"""
        if not self.app:
            raise Exception("Firebase not initialized")

        try:
            auth.delete_user(uid)
        except Exception as e:
            raise Exception(f"Failed to delete user: {str(e)}")


# Global instance
firebase_service = FirebaseService()
