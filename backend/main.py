import os
import io
import asyncio
import base64
import wave
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
import csv
import itertools
import copy
from ai_edge_litert.interpreter import Interpreter

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_labels(csv_path):
    with open(csv_path, encoding='utf-8-sig') as f:
        return [row[0] for row in csv.reader(f)]

def resolve_asset_path(filename):
    base_dir = Path(__file__).resolve().parent.parent
    candidates = [
        base_dir / filename,
        base_dir / "Models" / "Fingerspelling" / filename,
        base_dir / "Models" / "Fingerspelling Model" / filename,
    ]

    for path in candidates:
        if path.exists():
            return path

    searched = "\n".join(str(p) for p in candidates)
    raise FileNotFoundError(f"Could not find '{filename}'. Searched:\n{searched}")

def pre_process_landmark(landmark_list):
    temp_landmark_list = copy.deepcopy(landmark_list)
    base_x, base_y = 0, 0
    for index, landmark_point in enumerate(temp_landmark_list):
        if index == 0:
            base_x, base_y = landmark_point[0], landmark_point[1]
        temp_landmark_list[index][0] = temp_landmark_list[index][0] - base_x
        temp_landmark_list[index][1] = temp_landmark_list[index][1] - base_y

    temp_landmark_list = list(itertools.chain.from_iterable(temp_landmark_list))

    max_value = max(list(map(abs, temp_landmark_list)))
    def normalize_(n):
        return n / max_value if max_value != 0 else 0
    
    return list(map(normalize_, temp_landmark_list))

interpreter = None
labels = None
input_details = None
output_details = None

try:
    model_path = resolve_asset_path("keypoint_classifier.tflite")
    labels_path = resolve_asset_path("keypoint_classifier_label.csv")
    
    interpreter = Interpreter(model_path=str(model_path))
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()[0]
    output_details = interpreter.get_output_details()[0]
    
    labels = load_labels(labels_path)
    print("Model loaded successfully")
except Exception as e:
    print(f"Error loading model: {e}")

class Point(BaseModel):
    x: float
    y: float
    z: float

class LandmarkRequest(BaseModel):
    landmarks: List[Point]
    width: int
    height: int

class NarrateRequest(BaseModel):
    sequence: str


class TranscribeRequest(BaseModel):
    audio_base64: str
    mime_type: str = "audio/webm"


class WlaslPredictRequest(BaseModel):
    """Sequence of hands_pose frames (each length 258: pose 132 + lh 63 + rh 63)."""
    frames: List[List[float]]
    max_frames: Optional[int] = None

def _fallback_speak_phrase(sequence: str) -> str:
    s = " ".join(sequence.replace("\n", " ").split())
    return s if s else ""

def _pcm_to_wav(pcm: bytes, channels: int = 1, rate: int = 24000, sample_width: int = 2) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()

def _gemini_tts_sync(sequence: str) -> tuple[str, bytes]:
    """Returns (caption text for UI, WAV bytes). Empty bytes if no API key."""
    from google import genai
    from google.genai import types

    api_key = os.environ.get("GEMINI_API_KEY")
    caption = _fallback_speak_phrase(sequence)
    speak_line = caption.strip().lower() if caption.strip() else ""
    if not api_key:
        return speak_line or caption, b""

    model_name = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
    voice_name = os.environ.get("GEMINI_TTS_VOICE", "Kore")

    # Client sends one completed word at a time (after a space). Speak it as a normal English word, not letter-by-letter.
    tts_prompt = (
        "Say this as a normal spoken English word or short phrase—one smooth pronunciation. "
        "Do not spell out letters; do not pause between letters. "
        f"Word: {speak_line}"
    )

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model_name,
        contents=tts_prompt,
        config=types.GenerateContentConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name)
                )
            ),
        ),
    )

    cand = response.candidates[0].content.parts
    for part in cand:
        inline = getattr(part, "inline_data", None)
        if inline is None or inline.data is None:
            continue
        pcm = inline.data
        if isinstance(pcm, str):
            pcm = base64.b64decode(pcm)
        wav_bytes = _pcm_to_wav(pcm)
        return speak_line or caption, wav_bytes

    raise RuntimeError("Gemini TTS returned no audio part")


def _normalize_transcript_line(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    low = t.lower().strip("[]().")
    if low in ("silence", "no speech", "no audio", "empty", "none"):
        return ""
    if t.lower().startswith("[silence") and "]" in t:
        return ""
    return t


def _gemini_transcribe_sync(audio_bytes: bytes, mime_type: str) -> str:
    from google import genai
    from google.genai import types

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    model_name = os.environ.get("GEMINI_TRANSCRIBE_MODEL", "gemini-2.0-flash")
    prompt = (
        "Transcribe any spoken English in this audio. "
        "Reply with ONLY the spoken words as plain text—no quotes, bullets, labels, or commentary. "
        "If there is no speech or only background noise, reply with exactly: [silence]"
    )

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model_name,
        contents=[
            types.Part.from_bytes(data=audio_bytes, mime_type=mime_type or "audio/webm"),
            types.Part.from_text(text=prompt),
        ],
    )
    try:
        return (response.text or "").strip()
    except ValueError:
        return ""


@app.post("/gemini/transcribe")
async def gemini_transcribe(request: TranscribeRequest):
    if not os.environ.get("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not set")

    try:
        raw = base64.b64decode(request.audio_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 audio")

    max_bytes = int(os.environ.get("GEMINI_TRANSCRIBE_MAX_BYTES", str(8 * 1024 * 1024)))
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail="Audio chunk too large")

    if len(raw) < 128:
        return {"text": "", "skipped": True}

    mime = (request.mime_type or "audio/webm").strip()
    loop = asyncio.get_running_loop()
    try:
        raw_text = await loop.run_in_executor(None, _gemini_transcribe_sync, raw, mime)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini transcription error: {e!s}")

    text = _normalize_transcript_line(raw_text)
    return {"text": text, "skipped": False}


@app.post("/gemini/narrate")
async def gemini_narrate(request: NarrateRequest):
    raw = request.sequence
    if len(raw) > 4000:
        raise HTTPException(status_code=400, detail="Sequence too long")

    if not raw.strip():
        return {"phrase": "", "source": "empty", "audio_base64": None}

    has_key = bool(os.environ.get("GEMINI_API_KEY"))
    loop = asyncio.get_running_loop()
    try:
        phrase, wav_bytes = await loop.run_in_executor(None, _gemini_tts_sync, raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {e!s}")

    source = "gemini" if has_key and wav_bytes else "fallback"
    audio_b64 = base64.b64encode(wav_bytes).decode("ascii") if wav_bytes else None

    return {
        "phrase": phrase,
        "source": source,
        "audio_base64": audio_b64,
        "audio_mime_type": "audio/wav",
    }

@app.get("/wlasl/status")
async def wlasl_status():
    try:
        from wlasl_engine import get_engine

        eng = get_engine()
        if eng.error:
            return {"loaded": False, "error": eng.error}
        if eng.model is None:
            return {"loaded": False, "error": "Model not initialized"}
        return {
            "loaded": True,
            "labels": len(eng.labels),
            "max_frames": eng.max_frames,
            "input_size": eng.input_size,
        }
    except Exception as e:
        return {"loaded": False, "error": str(e)}


@app.post("/predict/wlasl")
async def predict_wlasl(request: WlaslPredictRequest):
    try:
        from wlasl_engine import get_engine

        eng = get_engine()
        if eng.model is None:
            raise HTTPException(
                status_code=503,
                detail=eng.error or "WLASL model not loaded. Set WLASL_CHECKPOINT or install torch.",
            )
        arr = np.asarray(request.frames, dtype=np.float32)
        if arr.size == 0:
            raise HTTPException(status_code=400, detail="frames is empty")
        mf = request.max_frames
        idx, conf, label = eng.predict(arr, max_frames_override=mf)
        return {"class_index": idx, "confidence": conf, "word": label}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict")
async def predict_sign(request: LandmarkRequest):
    if not interpreter or not labels:
        raise HTTPException(status_code=500, detail="Model not loaded")

    if len(request.landmarks) != 21:
        raise HTTPException(status_code=400, detail="Expected 21 landmarks")

    image_width = request.width
    image_height = request.height

    landmark_list = []
    for landmark in request.landmarks:
        landmark_x = min(int(landmark.x * image_width), image_width - 1)
        landmark_y = min(int(landmark.y * image_height), image_height - 1)
        landmark_list.append([landmark_x, landmark_y])

    processed_landmarks = pre_process_landmark(landmark_list)

    input_data = np.array([processed_landmarks], dtype=np.float32)
    interpreter.set_tensor(input_details['index'], input_data)
    interpreter.invoke()

    prediction = interpreter.get_tensor(output_details['index'])
    best_guess_index = int(np.argmax(np.squeeze(prediction)))
    confidence = float(np.squeeze(prediction)[best_guess_index])
    english_letter = labels[best_guess_index]

    # Always return top-1; UI can show confidence. (A fixed 0.8 gate hid most real-time guesses.)
    return {"letter": english_letter, "confidence": confidence}
