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
