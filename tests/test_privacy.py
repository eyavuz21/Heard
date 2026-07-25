"""The privacy claim -- the profile store only ever knows the user's own speech --
is easy to violate by accident later (e.g. someone adding an "other_said" column
for a feature). Assert it structurally so a regression fails loudly here instead
of leaking in production.
"""

from __future__ import annotations

import inspect
import sqlite3

import pytest

from app.config import settings
import app.profile as profile_module
from app.profile import ProfileStore


FORBIDDEN_SUBSTRINGS = ("speaker", "other", "ambient", "partner")


@pytest.fixture()
def store(tmp_path, monkeypatch) -> ProfileStore:
    db_path = tmp_path / "profiles.db"
    monkeypatch.setattr(settings, "profile_db_path", db_path)
    return ProfileStore(db_path)


def test_profile_store_has_no_speaker_field(store: ProfileStore) -> None:
    cursor = store._conn.execute("PRAGMA table_info(confirmed_pairs)")
    columns = [row[1].lower() for row in cursor.fetchall()]
    for column in columns:
        for forbidden in FORBIDDEN_SUBSTRINGS:
            assert forbidden not in column, (
                f"column {column!r} references {forbidden!r} -- the schema must have "
                "no place to put the third party"
            )


def test_profile_source_never_references_other_speaker() -> None:
    source = inspect.getsource(profile_module)
    assert "Speaker.OTHER" not in source
    assert '"other"' not in source
    assert "'other'" not in source


def test_round_trip_ordering_and_vocabulary(store: ProfileStore) -> None:
    store.add_pair("alice", heard="cat", said="cap")
    store.add_pair("alice", heard="dog", said="dog")
    store.add_pair("alice", heard="cap", said="cap")

    assert store.pair_count("alice") == 3

    recent = store.recent_pairs("alice", limit=10)
    assert [p.said for p in recent] == ["cap", "dog", "cap"]  # most recent first

    vocab = store.vocabulary("alice", limit=10)
    assert vocab[0] == "cap"  # appears twice, ranks first
    assert "dog" in vocab


def test_reset_clears(store: ProfileStore) -> None:
    store.add_pair("bob", heard="tea", said="tea")
    assert store.pair_count("bob") > 0

    store.reset("bob")

    assert store.pair_count("bob") == 0
    assert store.recent_pairs("bob", limit=10) == []
