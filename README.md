# 🎵 VirtuosoVision

**Transform any song into a unique, procedurally generated audio-reactive world — powered by AI and real-time GPU shaders.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Three.js](https://img.shields.io/badge/Three.js-R170-black?logo=three.js)](https://threejs.org)
[![Ollama](https://img.shields.io/badge/Ollama-Mistral-white)](https://ollama.com)

---

## ✨ Mind-Bending Capabilities

Upload a song URL → VirtuosoVision summons the raw auditory soul of the music, transcribes every breath with Whisper, and unleashes a **local Ollama LLM** to hallucinate a breathtaking, hyper-vivid reality. The AI weaves a deep, cinematic lore and a cryptographic mathematical fingerprint of 30+ dimensional parameters. These parameters inject pure adrenaline into a **real-time GLSL fragment shader** and a galaxy of massive, audio-reactive particle systems, forging a completely unique, face-melting 3D world at a blistering 60 FPS. You can even tear through the fabric of this generated universe in first-person (FPS mode)!

---

## 🎨 Core Features

### 🌌 God-Tier Procedural 3D Engine
- **Face-Melting GLSL Fragment Shader** — Every single pixel is mathematically annihilated and reborn on your GPU in real-time.
- **30+ God-Mode Parameters** — Command reality itself: bend geometry, shatter dimensions, summon fog, ignite ethereal glows, and manipulate gravity.
- **Galactic Particle Storms** — Thousands of hyper-glowing fireflies and ambient celestial dust motes that violently swell and accelerate to the sheer kinetic force of the beat.
- **FPS Dimension Drifting** — Break the fourth wall. Pointer-lock controls (W/A/S/D/Shift/Space) let you fly through the neon guts of your own generated universe at warp speed.
- **Omni-Layered Composition** — Aurora/nebula skies → reality-bending FBM noise + Voronoi cells → GPU-sculpted terrain → blinding volumetric god rays.
- **Domain Warping** — Simplex noise-driven UV distortion that rips apart space to create organic, hallucinatory visuals.

### 🎭 Cinematic HUD & Reality-Bending Lore
- **Generative World Lore** — A localized AI hivemind hallucinates a custom, chillingly accurate cinematic history for the dimension it just spawned.
- **Hyper-Reactive Lyric HUD** — Lyrics don't just appear; they materialize as a breathtaking, glassmorphic cinematic overlay that drifts through the void and violently pulses with the bass frequencies, making you feel the words in your bones.
- **Omniscient Insight Panel** — Peek directly into the brain of the AI: view its visual interpretation, hexadecimal soul palette, and psycho-acoustic mood classification in real-time.

### Audio Reactivity
- **Web Audio API → FFT → Shader** — real-time bass, mid, and treble energy extracted via `AnalyserNode`
- **Mutable Zustand store** — frequency data flows to the GPU every frame with zero React re-renders
- **Per-band reactivity** — bass drives distortion and pulse, treble drives particle brightness and detail
- **Smooth interpolation** — exponential smoothing prevents jarring visual jumps

### AI-Powered Pipeline
- **OpenAI Whisper** — speech-to-text with timestamped lyric segments
- **HuggingFace Transformers** — local emotion/mood classification (happy, sad, energetic, calm, melancholic, ethereal, dark, uplifting)
- **Ollama (Mistral)** — generates vivid scene descriptions, structured JSON scene parameters, and creative world "lore" from lyrics + mood
- **Deterministic fallback** — if Ollama is unavailable, a hash-based generator produces unique-per-song defaults

### Production Infrastructure
- **Firebase Authentication** — secure user registration and JWT verification
- **MongoDB (Motor)** — async document storage for songs, visions, and users
- **Supabase pgvector** — 1536-dim embeddings for semantic song search
- **Celery + Redis** — background task queue with automatic retries and exponential backoff
- **n8n Webhooks** — email notifications when processing completes
- **Docker Compose** — single-command local environment with GPU-accelerated Ollama

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────────────────────────┐
│   Next.js 14    │     │                   FastAPI Backend                        │
│   (Frontend)    │     │                                                          │
│                 │     │  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐   │
│  React Three    │────▶│  │ Auth API │  │ Songs API│  │ Visions API           │   │
│  Fiber Canvas   │     │  └────┬─────┘  └────┬─────┘  └───────────┬───────────┘   │
│                 │     │       │              │                    │               │
│  GLSL Shader    │     │  Firebase       MongoDB              MongoDB             │
│  (full-screen)  │     │  Admin          (Motor)              (Motor)             │
│                 │     │                     │                                     │
│  Zustand Store  │     │              ┌──────▼──────┐                             │
│  (FFT → GPU)    │     │              │ Celery Task │──▶ Redis (broker)           │
│                 │     │              └──────┬──────┘                             │
└─────────────────┘     │     ┌───────┬──────┴──────┬──────────┐                  │
                        │     ▼       ▼             ▼          ▼                  │
                        │  yt-dlp  Whisper    Mood Classifier  Ollama (Mistral)   │
                        │  (audio) (OpenAI)  (HuggingFace)    (scene params)     │
                        │                                          │              │
                        │                                    Supabase pgvector    │
                        └──────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Docker & Docker Compose | Latest | Container orchestration |
| Node.js | 18+ | Frontend dev server |
| NVIDIA GPU + Drivers | (Optional) | GPU-accelerated Ollama |
| Firebase Project | — | User authentication |
| OpenAI API Key | — | Whisper transcription |
| Supabase Project | — | Vector embeddings |

### 1. Clone & Configure

```bash
git clone <repo-url>
cd virtuoso_clean

# Backend environment
cp packages/backend/.env.example packages/backend/.env
# → Edit packages/backend/.env with your API keys (see Environment Variables below)

# Frontend environment
cp packages/frontend/.env.local.example packages/frontend/.env.local
# → Edit packages/frontend/.env.local with your Firebase config
```

### 2. Launch Infrastructure

```bash
docker-compose up -d
```

This starts **7 services**:

| Service | Port | Description |
|---|---|---|
| `backend` | 8000 | FastAPI REST API |
| `mongodb` | 27017 | Document database |
| `redis` | 6379 | Task broker & cache |
| `worker` | — | Celery task consumer |
| `celery_beat` | — | Scheduled task runner |
| `ollama` | 11434 | Local LLM server (GPU) |
| `ollama-init` | — | Auto-pulls Mistral model on first run |

### 3. Start Frontend

```bash
cd packages/frontend
npm install
npm run dev
```

### 4. Open

```
http://localhost:3000
```

---

## 📁 Project Structure

```
virtuoso_clean/
├── docker-compose.yml              # 7-service orchestration (backend, mongo, redis, worker, beat, ollama, ollama-init)
├── ollama-init.sh                  # Ollama readiness check + model pull script
│
├── packages/
│   ├── frontend/                   # Next.js 14 (App Router, TypeScript)
│   │   ├── app/
│   │   │   ├── page.tsx            # Landing page (hero + 3D shader background)
│   │   │   ├── layout.tsx          # Root layout with providers
│   │   │   ├── providers.tsx       # Toaster provider (sonner)
│   │   │   ├── globals.css         # Tailwind + global styles
│   │   │   ├── login/              # Firebase login page
│   │   │   ├── signup/             # Firebase signup page
│   │   │   ├── explore/            # Vision gallery (grid/list view, search, sort)
│   │   │   └── vision/[id]/        # Full-screen vision player
│   │   ├── components/
│   │   │   ├── 3d/
│   │   │   │   └── Scene.tsx       # GLSL shader engine (vertex + fragment shaders, 30+ uniforms)
│   │   │   └── ui/
│   │   │       ├── NavBar.tsx      # Top navigation bar
│   │   │       ├── SideNav.tsx     # Side navigation
│   │   │       ├── UploadModal.tsx # Song URL upload form
│   │   │       └── LyricsPanel.tsx # Timestamped lyrics overlay
│   │   ├── lib/
│   │   │   ├── api.ts              # Backend API client (auth, songs, visions)
│   │   │   ├── firebase.ts         # Firebase client init + token management
│   │   │   ├── audio-store.ts      # Zustand store (FFT frequency data)
│   │   │   └── vision-store.ts     # Zustand store (active vision state)
│   │   └── middleware.ts           # Auth route protection
│   │
│   └── backend/                    # FastAPI (Python 3.11+)
│       ├── app/
│       │   ├── main.py             # FastAPI app, CORS, router registration, lifespan
│       │   ├── config.py           # Pydantic Settings (env vars)
│       │   ├── api/routes/
│       │   │   ├── auth.py         # POST /api/auth/register, GET /api/auth/me
│       │   │   ├── songs.py        # CRUD + debug sample creation
│       │   │   ├── visions.py      # CRUD + debug sample creation
│       │   │   ├── embeddings.py   # Generate, search, batch embeddings
│       │   │   └── health.py       # GET /api/health
│       │   ├── models/
│       │   │   ├── song.py         # SongDB, SceneParameters (30+ fields), AudioFeatures, LyricSegment
│       │   │   ├── vision.py       # VisionDB
│       │   │   └── user.py         # UserDB
│       │   ├── services/
│       │   │   ├── mongodb_service.py     # Async MongoDB CRUD (Motor)
│       │   │   ├── firebase_service.py    # Firebase Admin SDK (JWT verification)
│       │   │   ├── supabase_service.py    # Supabase client (pgvector)
│       │   │   └── embeddings_service.py  # Embedding generation + similarity search
│       │   ├── ml/
│       │   │   ├── whisper_wrapper.py     # OpenAI Whisper transcription
│       │   │   ├── mood_classifier.py     # HuggingFace emotion detection
│       │   │   └── ollama_wrapper.py      # Ollama client (visual prompts + scene params + mood analysis)
│       │   └── workers/
│       │       ├── celery_app.py          # Celery configuration
│       │       └── tasks.py              # 7-step processing pipeline + notifications
│       ├── Dockerfile
│       ├── requirements.txt
│       └── .env.example
```

---

## 🎬 How It Works

### The 7-Step Pipeline

```
User submits a song URL
    │
    ▼
[1] Download audio stream (yt-dlp → MP3 via FFmpeg)
    │
    ▼
[2] Transcribe lyrics with timestamps (OpenAI Whisper)
    │
    ▼
[3] Classify mood from lyrics (HuggingFace Transformers)
    │
    ▼
[4] Generate vivid visual description & World Lore (Ollama Mistral, temp=0.9)
    │       "Obsidian cliffs rise from a sea of liquid chrome... This is the graveyard of a forgotten civilization."
    ▼
[5] Generate 30+ scene parameters as structured JSON (Ollama Mistral, temp=0.4)
    │       { colors: {c1:"#06B6D4",...}, geometryComplexity: 0.7, particleDensity: 0.8... }
    ▼
[6] Store song + vision in MongoDB, embeddings in Supabase pgvector
    │
    ▼
[7] Send completion notification via n8n webhook → User explores the vision!
```

### Audio → Shader Data Flow

```
Web Audio API (AnalyserNode)
    │
    ▼  getByteFrequencyData()
FFT Buffer (256 frequency bins)
    │
    ▼  Split into bass / mid / treble bands
Zustand Mutable Store (no React re-renders)
    │
    ▼  useFrame() reads every frame (~60 Hz)
GLSL Uniforms (u_bass, u_mid, u_treble)
    │
    ▼  Fragment shader computes every pixel
GPU Output → Canvas → 60 FPS visualization
```

---

## 🔌 API Reference

### Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health check |

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user (Firebase token required) |
| `GET` | `/api/auth/me` | Get current user profile |

### Songs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/songs` | Upload song URL → triggers background pipeline |
| `GET` | `/api/songs/{id}` | Get song by ID (lyrics, mood, scene params) |
| `GET` | `/api/songs/user/all` | List all songs for current user |
| `DELETE` | `/api/songs/{id}` | Delete a song |
| `POST` | `/api/songs/debug/create-sample` | Create sample song with pre-built params |

### Visions
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/visions` | Create a new vision |
| `GET` | `/api/visions/{id}` | Get vision by ID |
| `GET` | `/api/visions/user/all` | List all visions for current user |
| `PATCH` | `/api/visions/{id}` | Update vision (e.g., toggle favorite) |
| `DELETE` | `/api/visions/{id}` | Delete a vision |
| `POST` | `/api/visions/debug/create-sample` | Create sample vision for testing |

### Embeddings
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/embeddings/generate` | Generate embedding vector for text |
| `POST` | `/api/embeddings/song` | Generate and store embedding for a song |
| `POST` | `/api/embeddings/search` | Semantic similarity search across songs |
| `GET` | `/api/embeddings/song/{id}` | Retrieve stored embedding for a song |
| `POST` | `/api/embeddings/batch` | Batch generate embeddings (max 100) |

> **Interactive docs:** http://localhost:8000/docs (Swagger UI)

---

## 🔧 Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **Next.js 14** | React framework (App Router) |
| **React Three Fiber** | Three.js bridge for React |
| **Custom GLSL Shaders** | Full-screen procedural fragment shader |
| **Zustand** | High-performance mutable state (FFT data) |
| **Framer Motion** | Page transitions and micro-animations |
| **Tailwind CSS** | Utility-first styling |
| **Firebase SDK** | Client-side authentication |
| **Sonner** | Toast notifications |
| **Lucide React** | Icon system |
| **WaveSurfer.js** | Audio waveform display |
| **TypeScript** | Type safety |

### Backend
| Technology | Purpose |
|---|---|
| **FastAPI** | Async Python web framework |
| **Motor** | Async MongoDB driver |
| **Celery** | Distributed task queue |
| **Redis** | Message broker + result backend |
| **Firebase Admin** | JWT token verification |
| **Supabase** | pgvector for semantic search |
| **yt-dlp** | Audio download from YouTube/SoundCloud/etc. |
| **FFmpeg** | Audio transcoding to MP3 |

### AI / ML
| Technology | Purpose |
|---|---|
| **OpenAI Whisper** | Speech-to-text transcription |
| **HuggingFace Transformers** | Emotion/mood classification |
| **Ollama (Mistral 7B)** | Visual description + scene parameter generation |
| **Scikit-learn** | Supporting ML utilities |

---

## 🔐 Environment Variables

### Backend (`packages/backend/.env`)

```env
# ── Supabase ──
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_EMBEDDINGS_TABLE=song_embeddings

# ── OpenAI (Whisper) ──
OPENAI_API_KEY=your_openai_api_key

# ── HuggingFace (Mood Classifier) ──
HUGGINGFACE_API_KEY=your_huggingface_api_key

# ── Firebase Authentication ──
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY=your_firebase_private_key
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_CLIENT_ID=your_firebase_client_id

# ── MongoDB ──
MONGODB_URL=mongodb://localhost:27017/virtuosovision
MONGODB_DB=virtuosovision

# ── Redis ──
REDIS_URL=redis://localhost:6379/0

# ── Celery ──
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# ── Ollama (Local LLM) ──
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=mistral

# ── FastAPI Server ──
HOST=0.0.0.0
PORT=8000
WORKERS=4
DEBUG=false
FRONTEND_URL=http://localhost:3000

# ── Media Processing ──
YOUTUBE_API_ENABLED=true
MAX_UPLOAD_SIZE=524288000

# ── Notifications ──
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/virtuoso
NOTIFICATION_EMAIL=noreply@virtuosovision.com
```

### Frontend (`packages/frontend/.env.local`)

```env
# ── Firebase ──
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id

# ── API ──
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🛠️ Development

### Running Locally

```bash
# Terminal 1: Start all infrastructure
docker-compose up -d

# Terminal 2: Frontend dev server (hot reload)
cd packages/frontend && npm run dev

# Terminal 3: Watch backend logs
docker-compose logs -f backend

# Terminal 4: Watch Celery worker logs
docker-compose logs -f worker
```

### Testing

```bash
cd packages/backend
pytest -v
```

### Useful Docker Commands

```bash
docker-compose up -d          # Start all services
docker-compose logs -f         # Tail all logs
docker-compose ps              # Service status
docker-compose restart backend # Restart single service
docker-compose down            # Stop all
docker-compose down -v         # Stop + remove volumes
```

---

## ☁️ Deployment

### Backend → Google Cloud Run

```bash
cd packages/backend

docker build -t gcr.io/YOUR_PROJECT/virtuoso-backend .
docker push gcr.io/YOUR_PROJECT/virtuoso-backend

gcloud run deploy virtuoso-backend \
  --image gcr.io/YOUR_PROJECT/virtuoso-backend \
  --memory 2Gi \
  --timeout 3600 \
  --set-env-vars FIREBASE_PROJECT_ID=...,OPENAI_API_KEY=...,MONGODB_URL=...
```

### Frontend → Vercel

```bash
cd packages/frontend
npx vercel env add NEXT_PUBLIC_API_URL
npx vercel deploy --prod
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|---|---|
| `Connection refused on port 8000` | `docker-compose ps` — ensure backend is running |
| `Ollama not available - using fallback mode` | Check Ollama container: `docker-compose logs ollama` |
| `Mistral model not found` | Wait for `ollama-init` to finish, or manually run `docker exec virtuoso_ollama ollama pull mistral` |
| `Whisper transcription failed` | Verify `OPENAI_API_KEY` is set and valid |
| `Firebase initialization failed` | Check all `FIREBASE_*` env vars in backend `.env` |
| `WebGL Error in browser` | Enable hardware acceleration in browser settings; check `https://get.webgl.org` |
| `Celery tasks stuck` | Check Redis: `docker-compose logs redis`; restart worker: `docker-compose restart worker` |
| `Frontend can't reach API` | Verify `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local` |

---

## 📝 Roadmap

- [ ] Playlist support (batch processing)
- [ ] Collaborative visions (share & co-explore)
- [ ] WebXR / VR mode
- [ ] Custom shader editor (live GLSL editing)
- [ ] Real-time multiplayer exploration
- [ ] Scene template marketplace
- [ ] Mobile app (React Native)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **[Three.js](https://threejs.org)** / **[React Three Fiber](https://docs.pmnd.rs/react-three-fiber)** — 3D rendering
- **[FastAPI](https://fastapi.tiangolo.com)** — backend framework
- **[Ollama](https://ollama.com)** — local LLM inference
- **[OpenAI Whisper](https://openai.com/research/whisper)** — speech-to-text
- **[HuggingFace](https://huggingface.co)** — transformer models
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — media downloading

---

**Made with 🎵 and ❤️ by Pranav Yadav**

*Every song deserves its own universe.*
