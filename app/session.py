"""In-memory session store.

This is the ONLY place the other speaker's text is allowed to live. Nothing here
is ever written to disk, and `clear()` must discard a session completely -- once
called, the thread is gone for good.
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field

from app.models import Speaker, Turn


@dataclass
class Session:
    session_id: str
    user_id: str
    thread: list[Turn] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)


class SessionStore:
    """Thread-safe, process-local session store. Uvicorn may serve across threads."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def create(self, user_id: str) -> Session:
        session = Session(session_id=uuid.uuid4().hex, user_id=user_id)
        with self._lock:
            self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> Session:
        with self._lock:
            return self._sessions[session_id]

    def append_turn(self, session_id: str, speaker: Speaker, text: str) -> Turn:
        turn = Turn(speaker=speaker, text=text, ts=time.time())
        with self._lock:
            self._sessions[session_id].thread.append(turn)
        return turn

    def recent_turns(self, session_id: str, limit: int) -> list[Turn]:
        with self._lock:
            thread = self._sessions[session_id].thread
            return thread[-limit:] if limit > 0 else []

    def last_other_utterance(self, session_id: str) -> str | None:
        with self._lock:
            thread = self._sessions[session_id].thread
            for turn in reversed(thread):
                if turn.speaker is Speaker.OTHER:
                    return turn.text
            return None

    def clear(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None


session_store = SessionStore()
