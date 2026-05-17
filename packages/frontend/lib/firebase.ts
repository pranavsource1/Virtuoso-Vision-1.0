// Centralized Firebase initialization — single instance shared across the app
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Prevent duplicate initialization — reuse existing app if already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

/**
 * Set the Firebase token as a cookie so Next.js middleware can read it
 * for server-side route protection.
 */
function setTokenCookie(token: string | null) {
  if (typeof document === 'undefined') return;
  if (token) {
    // Set cookie with SameSite=Lax, path=/, expires in 7 days
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `firebaseToken=${token}; path=/; expires=${expires}; SameSite=Lax`;
  } else {
    // Clear cookie
    document.cookie = 'firebaseToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  }
}

/**
 * Persist auth state — keeps localStorage and cookie in sync with Firebase auth.
 * Call this once at app startup (e.g., in Providers).
 */
function initAuthListener() {
  onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = await user.getIdToken();
      localStorage.setItem('firebaseToken', token);
      localStorage.setItem('userId', user.uid);
      setTokenCookie(token);
    } else {
      localStorage.removeItem('firebaseToken');
      localStorage.removeItem('userId');
      setTokenCookie(null);
    }
  });
}

const googleProvider = new GoogleAuthProvider();

export { app, auth, googleProvider, initAuthListener, setTokenCookie };
