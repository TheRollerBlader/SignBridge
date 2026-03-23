"""WebSocket bridge: browser sends 16 kHz PCM → Gemini Live API → transcript JSON.

Modelled after the reference AudioLoop in test_conversation.py:
- receive loop wraps `session.receive()` in `while True` so it survives across turns
- only `input_transcription` is forwarded (no model echo)
- browser→Gemini pump runs indefinitely until the browser disconnects
"""

from __future__ import annotations

import asyncio
import json
import os
from fastapi import WebSocket

from google import genai
from google.genai import types
from google.genai.live import AsyncSession

def _live_model() -> str:
    return os.environ.get(
        "GEMINI_LIVE_MODEL",
        "gemini-2.5-flash-native-audio-preview-12-2025",
    )


import re

_JUNK_RE = re.compile(
    r"(\*\*|transcrib|translat(ed|ing|ion)|I('ve| have| am| will| can)|"
    r"user said|ready to|process|maintain|ongoing|phonetic|"
    r"continue|diligent|capture|format|record|successfully)",
    re.IGNORECASE,
)


def _is_model_commentary(text: str) -> bool:
    """Return True if the text looks like model self-narration rather than a translation."""
    if len(text) > 300:
        return True
    if _JUNK_RE.search(text):
        return True
    return False


def _build_system_instruction(deaf_lang: str, hearing_lang: str) -> str:
    if deaf_lang == hearing_lang:
        return (
            "You are a silent captioning assistant. "
            "Your ONLY job is to enable input_audio_transcription. "
            "NEVER speak, NEVER generate text or audio responses, NEVER greet the user. "
            "Just listen."
        )
    return (
        f"You are a live interpreter from {hearing_lang} to {deaf_lang}. "
        "RULES (never break these):\n"
        f"1. Output ONLY the {deaf_lang} translation of the speaker's words.\n"
        "2. NEVER add commentary, greetings, explanations, or markdown.\n"
        "3. NEVER describe what you are doing (no 'I am translating…').\n"
        "4. NEVER output the original language — only the translation.\n"
        "5. If the speaker is silent, output nothing.\n"
        "6. Keep translations short and natural."
    )


def _build_configs(deaf_lang: str, hearing_lang: str) -> list[types.LiveConnectConfig]:
    """Return configs to try in order (TEXT first, AUDIO fallback)."""
    si = _build_system_instruction(deaf_lang, hearing_lang)
    return [
        types.LiveConnectConfig(
            response_modalities=[types.Modality.TEXT],
            input_audio_transcription=types.AudioTranscriptionConfig(),
            system_instruction=si,
        ),
        types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            input_audio_transcription=types.AudioTranscriptionConfig(),
            system_instruction=si,
        ),
    ]


async def _pump_browser_to_gemini(session: AsyncSession, websocket: WebSocket) -> None:
    """Forward binary PCM frames from browser → Gemini Live (runs until browser disconnects)."""
    from starlette.websockets import WebSocketDisconnect

    try:
        while True:
            message = await websocket.receive()
            mtype = message.get("type")
            if mtype == "websocket.disconnect":
                return
            if mtype != "websocket.receive":
                continue
            b = message.get("bytes")
            if b:
                await session.send_realtime_input(
                    audio=types.Blob(data=b, mime_type="audio/pcm;rate=16000")
                )
            text = message.get("text")
            if text:
                try:
                    cmd = json.loads(text)
                except json.JSONDecodeError:
                    continue
                if cmd.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        return


async def _pump_gemini_to_browser(
    session: AsyncSession, websocket: WebSocket, *, translating: bool = False
) -> None:
    """Receive from Gemini Live across *all* turns and forward to browser.

    When `translating` is True (languages differ), the model's text response is
    the translation — we forward it as `type: "translation"`.  `input_transcription`
    is always forwarded so the frontend can show partial drafts.
    """
    from starlette.websockets import WebSocketDisconnect

    try:
        while True:
            async for response in session.receive():
                sc = response.server_content
                if not sc:
                    continue

                it = sc.input_transcription
                if it:
                    text = it.text or ""
                    await websocket.send_json(
                        {
                            "type": "transcript",
                            "text": text,
                            "finished": bool(it.finished),
                        }
                    )

                if translating:
                    mt = sc.model_turn
                    if mt and mt.parts:
                        txt = "".join(
                            p.text for p in mt.parts if hasattr(p, "text") and p.text
                        ).strip()
                        if txt and not _is_model_commentary(txt):
                            await websocket.send_json(
                                {"type": "translation", "text": txt}
                            )
    except WebSocketDisconnect:
        return
    except asyncio.CancelledError:
        return


async def run_live_transcribe_session(
    websocket: WebSocket,
    *,
    api_key: str | None = None,
    deaf_lang: str = "English",
    hearing_lang: str = "English",
) -> None:
    from fastapi import WebSocketDisconnect

    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        try:
            await websocket.send_json({"type": "error", "message": "No Gemini API key provided"})
            await websocket.close(code=4001)
        except WebSocketDisconnect:
            pass
        return

    translating = deaf_lang != hearing_lang
    client = genai.Client(api_key=api_key)
    model = _live_model()
    last_err: str | None = None

    for cfg in _build_configs(deaf_lang, hearing_lang):
        try:
            async with client.aio.live.connect(model=model, config=cfg) as session:
                in_task = asyncio.create_task(_pump_browser_to_gemini(session, websocket))
                out_task = asyncio.create_task(
                    _pump_gemini_to_browser(session, websocket, translating=translating)
                )

                # Wait until either side finishes (browser disconnect or fatal error).
                done, pending = await asyncio.wait(
                    {in_task, out_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for t in pending:
                    t.cancel()
                    try:
                        await t
                    except (asyncio.CancelledError, Exception):
                        pass
                for t in done:
                    try:
                        exc = t.exception()
                    except asyncio.CancelledError:
                        continue
                    if exc and not isinstance(exc, WebSocketDisconnect):
                        last_err = str(exc)[:800]
            return
        except Exception as e:
            last_err = str(e)[:800]
            continue

    try:
        await websocket.send_json(
            {
                "type": "error",
                "message": last_err or "Could not start Gemini Live session",
            }
        )
    except WebSocketDisconnect:
        pass
