// API Service Layer with centralized error handling and token injection
import { auth, setTokenCookie } from '@/lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const AUTH_STATE_TIMEOUT_MS = 5000;

type AuthTokenOptions = {
  forceRefresh?: boolean;
  allowCachedToken?: boolean;
};

async function waitForAuthUser(): Promise<User | null> {
  if (typeof window === 'undefined') return null;
  if (auth.currentUser) return auth.currentUser;

  try {
    await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser;
  } catch (error) {
    console.warn('Firebase auth state was not ready yet:', error);
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;

    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      unsubscribe?.();
      resolve(user);
    };

    const timeoutId = window.setTimeout(() => finish(auth.currentUser), AUTH_STATE_TIMEOUT_MS);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => finish(user),
      () => finish(auth.currentUser)
    );
  });
}

/**
 * Get a Firebase ID token. Firebase Auth is the source of truth, but the
 * cached token is kept as a fallback so a slow auth restore is not treated as
 * a logout before the backend has a chance to verify the request.
 */
export async function getAuthToken({
  forceRefresh = false,
  allowCachedToken = true,
}: AuthTokenOptions = {}): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const user = await waitForAuthUser();

    if (user) {
      try {
        const token = await user.getIdToken(forceRefresh);
        localStorage.setItem('firebaseToken', token);
        localStorage.setItem('userId', user.uid);
        setTokenCookie(token);
        return token;
      } catch (error) {
        console.error('Failed to refresh Firebase token:', error);
      }
    }

    if (allowCachedToken) {
      const cachedToken = localStorage.getItem('firebaseToken');
      if (cachedToken) {
        setTokenCookie(cachedToken);
        return cachedToken;
      }
    }
  } catch (error) {
    console.error('Unexpected error in getAuthToken:', error);
  }

  return null;
}

function mergeHeaders(options: RequestInit, token: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  if (!options.headers) return headers;

  if (options.headers instanceof Headers) {
    options.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  if (Array.isArray(options.headers)) {
    for (const [key, value] of options.headers) {
      headers[key] = value;
    }
    return headers;
  }

  return {
    ...headers,
    ...options.headers,
  };
}

/**
 * Make an API request with automatic token injection and error handling.
 */
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const method = options.method || 'GET';
    console.log(`API Call: ${method} ${url}`);

    const token = await getAuthToken();

    if (!token) {
      return { data: null, error: 'Unauthorized - no token available. Please login.' };
    }

    const makeRequest = (authToken: string) => fetch(url, {
      ...options,
      headers: mergeHeaders(options, authToken),
    });

    let response = await makeRequest(token);
    console.log(`Response Status: ${response.status} ${response.statusText}`);

    if (response.status === 401) {
      console.warn('Backend rejected token. Refreshing Firebase token and retrying once.');
      const refreshedToken = await getAuthToken({
        forceRefresh: true,
        allowCachedToken: false,
      });

      if (refreshedToken) {
        response = await makeRequest(refreshedToken);
        console.log(`Retry Response Status: ${response.status} ${response.statusText}`);
      }
    }

    if (response.status === 401) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Backend auth error detail:', errorData);
      return {
        data: null,
        error: `Unauthorized: ${errorData.detail || 'Token verification failed. Please sign out and sign in again.'}`,
      };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.detail || errorData.message || `HTTP ${response.status}`;
      console.error(`API Error: ${errorMessage}`);
      return { data: null, error: errorMessage };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`API Error [${endpoint}]:`, errorMessage);
    return { data: null, error: errorMessage };
  }
}

// ============ SONGS API ============

export async function uploadSong(songUrl: string, title?: string, vibePrompt?: string) {
  return apiCall<{ songId: string; taskId: string; status: string }>(
    '/api/songs',
    {
      method: 'POST',
      body: JSON.stringify({ 
        songUrl: songUrl.trim(), 
        title: title?.trim() || undefined,
        vibePrompt: vibePrompt?.trim() || undefined
      }),
    }
  );
}

export async function getSong(songId: string) {
  return apiCall(
    `/api/songs/${songId}`,
    { method: 'GET' }
  );
}

// ============ VISIONS API ============

export async function getUserVisions() {
  return apiCall(
    '/api/visions/user/all',
    { method: 'GET' }
  );
}

export async function getVision(visionId: string) {
  return apiCall(
    `/api/visions/${visionId}`,
    { method: 'GET' }
  );
}

export async function toggleFavoriteVision(visionId: string, isFavorited: boolean) {
  return apiCall(
    `/api/visions/${visionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ favorited: isFavorited }),
    }
  );
}

// ============ AUTH API ============

export async function registerUser(email: string, displayName: string) {
  return apiCall(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({ email, displayName }),
    }
  );
}

export async function loginUser(email: string) {
  return apiCall(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    }
  );
}

export async function checkAuthStatus() {
  const token = await getAuthToken();
  if (!token) return { data: null, error: 'No token found' };

  return apiCall(
    '/api/auth/me',
    { method: 'GET' }
  );
}

// ============ UTILITY FUNCTIONS ============

/**
 * Logout user by clearing tokens.
 */
export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('firebaseToken');
    localStorage.removeItem('userId');
    setTokenCookie(null);
    window.location.href = '/login';
  }
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('firebaseToken');
}

/**
 * Get current user ID.
 */
export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('userId');
}

// ============ 3D MUSIC WORLD GENERATION ============

/**
 * Generation response types
 */
export interface GenerationStatusResponse {
  task_id?: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  progress: number;
  model_url?: string;
  splat_url?: string;
  music_url?: string;
  scene_description?: string;
  world_title?: string;
  error?: string;
}

/**
 * Trigger music world generation for a song
 */
export async function startMusicWorldGeneration(songId: string) {
  return apiCall<{ task_id: string; status: string; song_id: string; message: string }>(
    `/api/generation/music-world/${songId}`,
    { method: 'POST' }
  );
}

/**
 * Poll the status of a music world generation task
 */
export async function getMusicWorldStatus(taskId: string) {
  return apiCall<GenerationStatusResponse>(
    `/api/generation/music-world/${taskId}/status`,
    { method: 'GET' }
  );
}
