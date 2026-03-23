<p align="center">
  <img src="Media/Project Signbridge.svg" alt="SignBridge Logo" width="480" />
</p>

<h1 align="center">SignBridge</h1>

<p align="center">
  <strong>Bridging sign language and spoken language in real time</strong>
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" />
  <img alt="PyTorch" src="https://img.shields.io/badge/PyTorch-2.2+-EE4C2C?logo=pytorch&logoColor=white" />
  <img alt="TFLite" src="https://img.shields.io/badge/TFLite-Runtime-FF6F00?logo=tensorflow&logoColor=white" />
  <img alt="Gemini" src="https://img.shields.io/badge/Google_Gemini-API-4285F4?logo=google&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

SignBridge is an end-to-end communication tool that translates **sign language to text** and **speech to text** simultaneously, enabling real-time conversations between deaf and hearing individuals. It combines on-device computer vision, deep learning classifiers, and Google Gemini for transcription, translation, and text-to-speech.

## Features

- **Fingerspelling Recognition** — Detects hand landmarks via MediaPipe and classifies ASL letters A–Z in real time using a TFLite model.
- **Word-Level Sign Recognition** *(experimental)* — Buffers pose + hand landmark sequences and predicts sign glosses using a PyTorch LSTM/Transformer model trained on the WLASL dataset.
- **Live Speech Transcription** — Streams 16 kHz PCM audio over a WebSocket to Google Gemini Live for low-latency captions.
- **Cross-Language Translation** — When the deaf and hearing users speak different languages, the live transcription pipeline doubles as a spoken-language interpreter.
- **Text-to-Speech Narration** — Converts accumulated sign sequences into natural speech audio via Gemini's TTS modality.
- **Responsive Web App** — Modern SPA with pages for the interactive demo, live transcription, technology overview, methodology, and team info.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                     Frontend (React)                 │
│  MediaPipe Hand/Pose Landmarker  ·  AudioWorklet PCM │
└──────────┬──────────────┬───────────────┬────────────┘
           │ REST         │ REST          │ WebSocket
           ▼              ▼               ▼
┌──────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                   │
│                                                      │
│  POST /predict         → TFLite fingerspelling       │
│  POST /predict/wlasl   → PyTorch WLASL classifier    │
│  POST /gemini/transcribe → Gemini speech-to-text     │
│  POST /gemini/narrate    → Gemini TTS (WAV base64)   │
│  WS   /ws/live-transcribe → Gemini Live streaming    │
│  GET  /wlasl/status      → Model status & metadata   │
└──────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4, React Router 7 |
| Backend | FastAPI, Uvicorn, Pydantic v2, Python 3.11+ |
| ML — Fingerspelling | TFLite (`ai-edge-litert`), MediaPipe Hand Landmarker |
| ML — Word Signs | PyTorch (BiLSTM w/ attention or Transformer), MediaPipe Holistic |
| Speech / TTS | Google Gemini API (`google-genai`) — transcription, live streaming, text-to-speech |
| Training | MediaPipe 0.10.14 feature extraction, PyTorch training loop, WLASL dataset |

## Project Structure

```
SignBridge/
├── frontend/               # React SPA
│   ├── src/
│   │   ├── pages/          # Home, Demo, Transcription, Technology, Methodology, Team
│   │   ├── components/     # Layout, Navbar, Footer
│   │   └── lib/            # liveCaption WebSocket helper
│   └── public/             # Static assets, PCM AudioWorklet processor
├── backend/                # FastAPI server
│   ├── main.py             # Routes & app setup
│   ├── wlasl_engine.py     # WLASL model loader & inference
│   └── gemini_live_ws.py   # Gemini Live WebSocket bridge
├── Models/
│   ├── Fingerspelling/     # TFLite model + label CSV (A–Z)
│   └── 2000_common_word/   # PyTorch WLASL checkpoint
├── Training/
│   ├── mediapipe_extraction.py   # Feature extraction from video
│   ├── wlasl_2000_train.py       # LSTM/Transformer training script
│   ├── checkpoints/              # Saved model weights
│   └── reports/latest/           # Accuracy reports, confusion matrices
├── Media/                  # Logo & promo assets
├── wlasl_demo.py           # Standalone WLASL inference demo
├── fingerspelling_demo.py  # Standalone fingerspelling demo
├── hand_points_demo.py     # MediaPipe landmark visualizer
├── requirements.txt        # Python deps for demos & training
└── netlify.toml            # Frontend deployment config
```

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **Python** >= 3.11
- A **Google Gemini API key** (for transcription, TTS, and live captioning)

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/SignBridge.git
cd SignBridge
```

### 2. Set up the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file (or edit the existing one):

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

> The Gemini key is optional at the server level — the frontend UI also provides an input field that sends the key per-request.

### 3. Set up the frontend

```bash
cd frontend
npm install
```

### 4. Run both servers

From the `frontend/` directory:

```bash
npm run dev:all
```

This starts **Vite** (frontend on `http://localhost:5173`) and **Uvicorn** (backend on `http://127.0.0.1:8000`) concurrently. The Vite dev server proxies `/api/*` requests to the backend automatically.

Alternatively, run them separately:

```bash
# Terminal 1 — backend
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — frontend
cd frontend
npm run dev
```

### 5. Open the app

Navigate to **http://localhost:5173** and grant camera/microphone permissions when prompted.

## Models

### Fingerspelling Classifier

- **Input:** 21 hand landmarks (x, y) extracted by MediaPipe
- **Output:** One of 26 classes (A–Z)
- **Format:** TFLite (quantized, runs on-device via `ai-edge-litert`)
- **Location:** `Models/Fingerspelling/keypoint_classifier.tflite`

### WLASL Word Classifier *(experimental)*

- **Input:** Sequence of frames, each a 258-dimensional vector (33×4 pose + 21×3 per hand)
- **Output:** Word-level gloss prediction
- **Architecture:** Bidirectional LSTM with attention pooling, or Transformer encoder
- **Location:** `Models/2000_common_word/wlasl_best.pt`

## Training Your Own Models

### Feature Extraction

```bash
python Training/mediapipe_extraction.py \
  --wlasl_root path/to/wlasl_videos \
  --feature_mode hands_pose
```

Requires **Python 3.11** (MediaPipe compatibility). Outputs `.npy` feature sequences per video.

### Model Training

```bash
python Training/wlasl_2000_train.py \
  --wlasl_root Training/wlasl_100 \
  --arch transformer \
  --epochs 100 \
  --batch_size 32
```

Key flags: `--arch` (`lstm` | `transformer`), `--loss` (`ce` | `focal`), `--weighted_sampling`, `--augment_noise`, `--augment_drop`. Checkpoints and reports are saved to `Training/checkpoints/` and `Training/reports/latest/`.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | Google Gemini API key (optional if provided per-request) |
| `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` | Model used for text-to-speech |
| `GEMINI_TTS_VOICE` | `Kore` | TTS voice name |
| `GEMINI_TRANSCRIBE_MODEL` | `gemini-2.5-flash` | Model used for batch transcription |
| `GEMINI_LIVE_MODEL` | `gemini-2.5-flash-native-audio-preview` | Model used for live WebSocket transcription |
| `WLASL_CHECKPOINT` | `Models/2000_common_word/wlasl_best.pt` | Path to WLASL model checkpoint |
| `WLASL_MAX_FRAMES` | `50` | Max sequence length for WLASL inference |

### Frontend (`.env` or shell)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | — | Production API base URL (omit for dev proxy) |

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/predict` | Classify fingerspelled letter from 21 hand landmarks |
| `POST` | `/predict/wlasl` | Classify word-level sign from a frame sequence |
| `GET` | `/wlasl/status` | Check WLASL model load status and metadata |
| `POST` | `/gemini/transcribe` | Transcribe audio (base64) via Gemini |
| `POST` | `/gemini/narrate` | Generate TTS audio from text, with optional translation |
| `WS` | `/ws/live-transcribe` | Stream live PCM audio for real-time captions |

## Deployment

The frontend is configured for **Netlify** deployment via `netlify.toml`:

- Build command: `npm ci && npm run build`
- Publish directory: `frontend/dist`
- SPA fallback: all routes redirect to `index.html`

The backend can be deployed to any Python hosting platform (Railway, Render, AWS, etc.). Set `VITE_API_BASE_URL` in the frontend build environment to point to the deployed backend URL.

## Standalone Demos

Run these from the project root to test models independently with a webcam:

```bash
# Fingerspelling recognition
python fingerspelling_demo.py

# WLASL word recognition
python wlasl_demo.py

# MediaPipe landmark visualization
python hand_points_demo.py
```

## License

This project is licensed under the MIT License.
