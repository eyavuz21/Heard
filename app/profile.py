"""Per-user profile store: the (heard -> said) memory that makes the product learn.

Deliberately narrow. This layer only ever sees the user's own speech -- the other
speaker's audio and text never pass through here, and the schema has no column to
put them in even if a caller tried.
"""

from __future__ import annotations

import re
import sqlite3
import threading
import time
from collections import Counter

from app.config import settings
from app.models import ConfirmedPair

# Small, inline -- not trying to be exhaustive, just enough to stop the vocabulary
# ranking from surfacing glue words instead of the words the user actually struggles
# to say.
_STOPWORDS = frozenset(
    {
        "the", "and", "for", "are", "but", "not", "you", "all", "can", "her",
        "was", "one", "our", "out", "day", "get", "has", "him", "his", "how",
        "man", "new", "now", "old", "see", "two", "way", "who", "boy", "did",
        "its", "let", "put", "say", "she", "too", "use", "that", "with", "have",
        "this", "will", "your", "from", "they", "know", "want", "been", "good",
        "much", "some", "time", "very", "when", "come", "here", "just", "like",
        "long", "make", "many", "over", "such", "take", "than", "them", "well",
        "were",
    }
)

_WORD_RE = re.compile(r"[a-z']+")


class ProfileStore:
    """SQLite-backed store of confirmed (heard -> said) pairs, one table, no ORM."""

    def __init__(self, db_path=None) -> None:
        db_path = db_path or settings.profile_db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._lock = threading.Lock()
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS confirmed_pairs (
                    id INTEGER PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    heard TEXT NOT NULL,
                    said TEXT NOT NULL,
                    ts REAL NOT NULL
                )
                """
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_confirmed_pairs_user_id "
                "ON confirmed_pairs (user_id)"
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id TEXT PRIMARY KEY,
                    voice_id TEXT,
                    updated_at REAL NOT NULL
                )
                """
            )
            self._conn.commit()

    def add_pair(self, user_id: str, heard: str, said: str) -> ConfirmedPair:
        # Always store, even when heard == said after casefold+strip: an accepted
        # guess is positive signal (the model got it right first try) and is free
        # to keep -- it still counts toward vocabulary frequency and pair_count,
        # which is the number the frontend uses to prove the learning loop works.
        ts = time.time()
        with self._lock:
            self._conn.execute(
                "INSERT INTO confirmed_pairs (user_id, heard, said, ts) VALUES (?, ?, ?, ?)",
                (user_id, heard, said, ts),
            )
            self._conn.commit()
        return ConfirmedPair(heard=heard, said=said, ts=ts)

    def recent_pairs(self, user_id: str, limit: int) -> list[ConfirmedPair]:
        cursor = self._conn.execute(
            "SELECT heard, said, ts FROM confirmed_pairs WHERE user_id = ? "
            "ORDER BY ts DESC LIMIT ?",
            (user_id, limit),
        )
        return [ConfirmedPair(heard=heard, said=said, ts=ts) for heard, said, ts in cursor.fetchall()]

    def vocabulary(self, user_id: str, limit: int) -> list[str]:
        cursor = self._conn.execute(
            "SELECT said FROM confirmed_pairs WHERE user_id = ?",
            (user_id,),
        )
        counts: Counter[str] = Counter()
        for (said,) in cursor.fetchall():
            for token in _WORD_RE.findall(said.lower()):
                if len(token) < 3 or token in _STOPWORDS:
                    continue
                counts[token] += 1
        return [word for word, _ in counts.most_common(limit)]

    def pair_count(self, user_id: str) -> int:
        cursor = self._conn.execute(
            "SELECT COUNT(*) FROM confirmed_pairs WHERE user_id = ?",
            (user_id,),
        )
        return cursor.fetchone()[0]

    def first_pass_count(self, user_id: str) -> int:
        """How many confirms accepted the model's best guess unchanged."""
        cursor = self._conn.execute(
            "SELECT heard, said FROM confirmed_pairs WHERE user_id = ?",
            (user_id,),
        )
        return sum(
            1
            for heard, said in cursor.fetchall()
            if heard.casefold().strip() == said.casefold().strip()
        )

    def reset(self, user_id: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM confirmed_pairs WHERE user_id = ?", (user_id,))
            self._conn.execute("DELETE FROM user_settings WHERE user_id = ?", (user_id,))
            self._conn.commit()

    def get_voice_id(self, user_id: str) -> str | None:
        cursor = self._conn.execute(
            "SELECT voice_id FROM user_settings WHERE user_id = ?",
            (user_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        voice_id = row[0]
        return voice_id if voice_id else None

    def set_voice_id(self, user_id: str, voice_id: str) -> None:
        ts = time.time()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO user_settings (user_id, voice_id, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    voice_id = excluded.voice_id,
                    updated_at = excluded.updated_at
                """,
                (user_id, voice_id, ts),
            )
            self._conn.commit()

    def clear_voice_id(self, user_id: str) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO user_settings (user_id, voice_id, updated_at)
                VALUES (?, NULL, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    voice_id = NULL,
                    updated_at = excluded.updated_at
                """,
                (user_id, time.time()),
            )
            self._conn.commit()


profile_store = ProfileStore()
