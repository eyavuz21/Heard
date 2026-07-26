"""ElevenLabs Scribe realtime: mint short-lived client tokens.

Ambient audio never touches this process. The browser streams mic audio straight to
ElevenLabs with a single-use token; we only ever receive committed text back.
"""

from __future__ import annotations

import httpx

from app.config import settings

_TOKEN_URL = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe"


class ScribeUnavailable(RuntimeError):
    """Raised when we cannot mint a realtime scribe token."""


async def create_realtime_token() -> str:
    if not settings.elevenlabs_api_key:
        raise ScribeUnavailable(
            "ELEVENLABS_API_KEY is not set. Add it to your .env file to enable "
            "live ambient transcription (get a key at https://elevenlabs.io)."
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            _TOKEN_URL,
            headers={"xi-api-key": settings.elevenlabs_api_key},
        )

    if response.status_code != 200:
        raise ScribeUnavailable(
            f"ElevenLabs scribe token failed ({response.status_code}): {response.text}"
        )

    token = response.json().get("token")
    if not token or not isinstance(token, str):
        raise ScribeUnavailable("ElevenLabs scribe token response missing token")
    return token
