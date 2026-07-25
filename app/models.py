"""The API contract. This module is the single source of truth -- if the frontend and
the backend disagree about a shape, this file wins.

Nothing here imports FastAPI, so the eval harnesses can use these types directly.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Speaker(str, Enum):
    USER = "user"
    OTHER = "other"


class Turn(BaseModel):
    """One utterance in the conversation thread.

    Only text is ever retained. The other speaker's audio is discarded the moment it
    has been transcribed, and their text lives only as long as the session.
    """

    speaker: Speaker
    text: str
    ts: float


# --- requests -------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    user_id: str


class ConfirmRequest(BaseModel):
    chosen_text: str
    source: Literal["best", "alternate", "typed"]
    voice_id: str | None = None


# --- responses ------------------------------------------------------------------

class CreateSessionResponse(BaseModel):
    session_id: str


class AmbientResponse(BaseModel):
    """Result of transcribing the other speaker. Deliberately returns text only --
    there is no audio handle here because the audio no longer exists."""

    text: str
    appended: bool


class WordOption(BaseModel):
    """One word position in `best`, with the other readings the samples produced.

    These are real competing readings of this person's actual audio, not generic
    synonyms -- which is what makes the correction UI worth tapping.
    """

    index: int
    word: str
    alternatives: list[str]
    agreement: float = Field(ge=0.0, le=1.0)


class RelayResult(BaseModel):
    """What the user's held audio was recovered as.

    `needs_confirmation` is advisory: it tells the frontend whether to show a single
    guess or a set of options. The frontend confirms before speaking either way.
    """

    relay_id: str
    best: str
    confidence: float = Field(ge=0.0, le=1.0)
    alternates: list[str] = Field(default_factory=list, max_length=3)
    uncertain_words: list[str] = Field(default_factory=list)
    words: list[WordOption] = Field(default_factory=list)
    needs_confirmation: bool


class Voice(BaseModel):
    voice_id: str
    label: str
    age: str
    gender: str
    accent: str


class ClearedResponse(BaseModel):
    cleared: bool


class ThreadResponse(BaseModel):
    """The running conversation, for display.

    Session-scoped and memory-only. The other speaker's turns vanish when the session is
    cleared, and nothing here is ever written to the user's profile.
    """

    session_id: str
    turns: list[Turn]


class ProfileResponse(BaseModel):
    """Exposed so the frontend can show the learning loop happening live -- the pair
    count ticking up mid-conversation is the product's whole proof."""

    user_id: str
    pair_count: int
    recent_pairs: list[ConfirmedPair]
    vocabulary: list[str]


class ConfirmedPair(BaseModel):
    """A (what the model heard -> what the user actually meant) correction.

    These are the asset. Every confirm tap writes one, including confirms of the
    model's own best guess -- an accepted guess is positive signal and free to keep.
    """

    heard: str
    said: str
    ts: float


# --- model output ---------------------------------------------------------------

class RecognitionSample(BaseModel):
    """One raw sample back from Gemini, before the gate fuses several of them."""

    best: str
    confidence: float = Field(ge=0.0, le=1.0)
    alternates: list[str] = Field(default_factory=list)
    uncertain_words: list[str] = Field(default_factory=list)


ProfileResponse.model_rebuild()
