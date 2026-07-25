"""HTTP surface. Routes only -- all behaviour lives in the modules these call.

Contract notes for the frontend:
- Audio arrives as multipart/form-data under the field name `audio`.
- Nothing is ever spoken without a confirm. `/relay` returns what we think was said;
  `/confirm` is what actually produces speech. This is deliberate and not a step to
  optimise away.
"""

from __future__ import annotations

import logging
import os
import sys
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app import gate, recogniser, tts
from app.config import settings
from app.models import (
    AmbientResponse,
    ClearedResponse,
    ConfirmRequest,
    CreateSessionRequest,
    CreateSessionResponse,
    ProfileResponse,
    RelayResult,
    Speaker,
    ThreadResponse,
    Voice,
)
from app.profile import profile_store
from app.prompt_compiler import ContextLevel, compiler
from app.session import session_store

log = logging.getLogger(__name__)

# RELAY_TRACE=1 prints every Gemini request and response verbatim to the server console.
# Console only, deliberately: prompts embed the conversation thread, so routing this to a
# file would persist the other speaker's words, which is the one thing we promised not to
# do. See the note on `call_log` in recogniser.py.
if os.getenv("RELAY_TRACE"):
    logging.basicConfig(level=logging.INFO)
    trace = logging.getLogger("relay.calls")
    trace.setLevel(logging.DEBUG)
    trace.addHandler(logging.StreamHandler(sys.stdout))

app = FastAPI(title="Relay", version="0.1.0")

# Wide open: hackathon, frontend runs on a different origin, nothing sensitive is
# authenticated. Tighten before this is ever public.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Relay results held between /relay and /confirm, so the confirm can record what we
# originally heard against what the user says they actually meant. In memory, dropped on
# session clear -- this is the raw material of the learning loop, nothing more.
_pending: dict[str, tuple[str, str]] = {}  # relay_id -> (user_id, heard_text)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "ok": True,
        "gemini_key_set": bool(settings.gemini_api_key),
        "elevenlabs_key_set": bool(settings.elevenlabs_api_key),
        "model": settings.gemini_model,
    }


@app.post("/session", response_model=CreateSessionResponse)
async def create_session(req: CreateSessionRequest) -> CreateSessionResponse:
    session = session_store.create(req.user_id)
    return CreateSessionResponse(session_id=session.session_id)


@app.post("/session/{session_id}/ambient", response_model=AmbientResponse)
async def ambient(session_id: str, audio: UploadFile = File(...)) -> AmbientResponse:
    """Transcribe the other speaker and append to the conversation thread.

    Their audio exists only inside this function. It is never written to disk, never
    returned, and nothing derived from it reaches the user's profile -- we are processing
    a third party's voice without their consent to store it, so we don't store it.
    """
    _require_session(session_id)
    data = await audio.read()

    try:
        text = await recogniser.transcribe_ambient(data, audio.content_type or "audio/webm")
    finally:
        del data  # explicit, because this is the one thing we promised not to keep

    if not text:
        return AmbientResponse(text="", appended=False)

    session_store.append_turn(session_id, Speaker.OTHER, text)
    return AmbientResponse(text=text, appended=True)


@app.post("/session/{session_id}/relay", response_model=RelayResult)
async def relay(session_id: str, audio: UploadFile = File(...)) -> RelayResult:
    """Recover what the user meant. Does not speak -- see /relay/{id}/confirm."""
    session = _require_session(session_id)
    data = await audio.read()

    prompt = compiler.compile(
        level=ContextLevel.FULL,
        pairs=profile_store.recent_pairs(session.user_id, settings.max_confirmed_pairs),
        vocabulary=profile_store.vocabulary(session.user_id, settings.max_vocabulary_words),
        thread=session_store.recent_turns(session_id, settings.max_thread_turns),
    ).text

    # The control sees the same audio with no context at all. If its answer diverges
    # wildly from the contextual one, the conversation wrote the answer rather than the
    # audio, and the gate collapses confidence accordingly.
    control_prompt = compiler.compile(level=ContextLevel.NONE).text

    mime = audio.content_type or "audio/webm"
    try:
        samples, control = await recogniser.recognise_with_control(
            data, mime, prompt, control_prompt
        )
    except recogniser.RecognitionUnavailable as exc:
        # 503, not an empty recovery. The user must never be told "I couldn't understand
        # you" because our API key was missing.
        raise HTTPException(503, f"recognition unavailable: {exc}") from exc

    result = gate.fuse(samples, relay_id=uuid.uuid4().hex, control=control)

    _pending[result.relay_id] = (session.user_id, result.best)
    return result


@app.post("/relay/{relay_id}/confirm")
async def confirm(relay_id: str, req: ConfirmRequest) -> Response:
    """The user has told us what they meant. Record it, then speak it.

    Every confirm writes a pair, including one that accepts our own best guess -- an
    accepted guess is positive evidence and costs nothing to keep. This write is the
    learning loop; without it the product is just a transcription toy.
    """
    if relay_id not in _pending:
        raise HTTPException(404, f"unknown relay_id {relay_id}")
    user_id, heard = _pending.pop(relay_id)

    profile_store.add_pair(user_id, heard=heard, said=req.chosen_text)

    audio = await tts.synthesize(req.chosen_text, req.voice_id)
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"X-Relay-Id": relay_id, "X-Spoken-Text": req.chosen_text},
    )


@app.get("/session/{session_id}/thread", response_model=ThreadResponse)
async def thread(session_id: str, speaker: Speaker | None = None) -> ThreadResponse:
    """The running conversation, so the interface can show it live.

    Defaults to the other speaker's turns only -- that is what the interface displays
    while the user is deciding what to say, and it keeps the surface as narrow as the
    display actually needs. Pass ?speaker=user for their side, or omit the filter by
    passing both via repeated calls.
    """
    _require_session(session_id)
    turns = session_store.recent_turns(session_id, limit=100)
    if speaker is not None:
        turns = [t for t in turns if t.speaker is speaker]
    return ThreadResponse(session_id=session_id, turns=turns)


@app.delete("/session/{session_id}", response_model=ClearedResponse)
async def clear_session(session_id: str) -> ClearedResponse:
    """Ends the session and drops the thread, including everything the other person
    said. Nothing about them survives this call."""
    return ClearedResponse(cleared=session_store.clear(session_id))


@app.get("/voices", response_model=list[Voice])
async def voices() -> list[Voice]:
    return tts.VOICES


@app.get("/profile/{user_id}", response_model=ProfileResponse)
async def profile(user_id: str) -> ProfileResponse:
    """Exposed so the interface can show the learning loop happening -- watching the
    pair count rise mid-conversation is the product's whole argument."""
    return ProfileResponse(
        user_id=user_id,
        pair_count=profile_store.pair_count(user_id),
        recent_pairs=profile_store.recent_pairs(user_id, 10),
        vocabulary=profile_store.vocabulary(user_id, settings.max_vocabulary_words),
    )


def _require_session(session_id: str):
    try:
        return session_store.get(session_id)
    except KeyError:
        raise HTTPException(404, f"unknown session {session_id}") from None
