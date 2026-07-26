"""Route-level safety checks that avoid paid external calls."""

from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app


client = TestClient(app)


def test_confirm_rejects_empty_text_without_consuming_pending(monkeypatch) -> None:
    main_module._pending.clear()
    main_module._pending["relay-1"] = ("session-1", "user-1", "heard text")

    def fail_add_pair(*args, **kwargs):  # noqa: ANN002, ANN003
        raise AssertionError("empty confirm must not write to the profile")

    async def fail_synthesize(*args, **kwargs):  # noqa: ANN002, ANN003
        raise AssertionError("empty confirm must not call TTS")

    monkeypatch.setattr(main_module.profile_store, "add_pair", fail_add_pair)
    monkeypatch.setattr(main_module.tts, "synthesize", fail_synthesize)

    response = client.post(
        "/relay/relay-1/confirm",
        json={"chosen_text": "   ", "source": "best"},
    )

    assert response.status_code == 400
    assert "relay-1" in main_module._pending


def test_clear_session_drops_pending_relays_for_that_session() -> None:
    main_module._pending.clear()
    session = client.post("/session", json={"user_id": "alice"}).json()["session_id"]
    main_module._pending["drop-me"] = (session, "alice", "heard")
    main_module._pending["keep-me"] = ("other-session", "alice", "heard")

    response = client.delete(f"/session/{session}")

    assert response.status_code == 200
    assert response.json() == {"cleared": True}
    assert "drop-me" not in main_module._pending
    assert "keep-me" in main_module._pending


def test_ambient_appends_committed_text_without_audio() -> None:
    session = client.post("/session", json={"user_id": "alice"}).json()["session_id"]

    response = client.post(
        f"/session/{session}/ambient",
        json={"text": "  Flat white or latte?  "},
    )

    assert response.status_code == 200
    assert response.json() == {"text": "Flat white or latte?", "appended": True}

    thread = client.get(f"/session/{session}/thread", params={"speaker": "other"})
    assert thread.status_code == 200
    turns = thread.json()["turns"]
    assert len(turns) == 1
    assert turns[0]["text"] == "Flat white or latte?"
    assert turns[0]["speaker"] == "other"


def test_scribe_token_requires_elevenlabs_key(monkeypatch) -> None:
    session = client.post("/session", json={"user_id": "alice"}).json()["session_id"]
    monkeypatch.setattr(main_module.settings, "elevenlabs_api_key", "")

    response = client.post(f"/session/{session}/scribe-token")

    assert response.status_code == 503
    assert "scribe unavailable" in response.json()["detail"]


def test_profile_includes_voice_and_reset_returns_emily() -> None:
    user_id = "voice-user"
    main_module.profile_store.set_voice_id(user_id, "cloned-voice-123")

    profile = client.get(f"/profile/{user_id}")
    assert profile.status_code == 200
    assert profile.json()["voice_id"] == "cloned-voice-123"

    reset = client.delete(f"/profile/{user_id}/voice")
    assert reset.status_code == 200
    assert reset.json()["label"] == "Emily"
    assert reset.json()["voice_id"] == main_module.tts.DEFAULT_VOICE_ID
    assert client.get(f"/profile/{user_id}").json()["voice_id"] is None


def test_profile_reports_first_pass_stats_from_pairs() -> None:
    user_id = "words-user"
    main_module.profile_store.reset(user_id)
    main_module.profile_store.add_pair(user_id, heard="flat white", said="flat white")
    main_module.profile_store.add_pair(user_id, heard="alive", said="alright")

    profile = client.get(f"/profile/{user_id}").json()

    assert profile["pair_count"] == 2
    assert profile["first_pass_count"] == 1
    assert "flat" in profile["vocabulary"] or "white" in profile["vocabulary"]
    assert any(p["said"] == "alright" for p in profile["recent_pairs"])
