"""ElevenLabs text-to-speech: turns the recovered sentence into clean, intelligible
speech to hand to the stranger on the other side of the conversation.

Deliberately NOT voice cloning. Cloning a voice from this user's own dysarthric audio
would reproduce the slur in the clone -- the exact thing the relay exists to remove.
The voices below are ElevenLabs' stock library, picked for a UK-facing product.
"""

from __future__ import annotations

import httpx

from app.config import settings
from app.models import Voice

VOICES: list[Voice] = [
    Voice(
        voice_id="21m00Tcm4TlvDq8ikWAM",
        label="Rachel",
        age="young adult",
        gender="female",
        accent="American",
    ),
    Voice(
        voice_id="pFZP5JQG7iQjIQuC4Bku",
        label="Lily",
        age="young adult",
        gender="female",
        accent="British (London)",
    ),
    Voice(
        voice_id="JBFqnCBsd6RMkjVDRZzb",
        label="George",
        age="middle-aged",
        gender="male",
        accent="British (London)",
    ),
    Voice(
        voice_id="Xb7hH8MSUJpSbSDYk0k2",
        label="Alice",
        age="middle-aged",
        gender="female",
        accent="British (London)",
    ),
    Voice(
        voice_id="IKne3meq5aSn9XLyUdCD",
        label="Charlie",
        age="young adult",
        gender="male",
        accent="Australian",
    ),
    Voice(
        voice_id="N2lVS1w4EtoT3dr4eOWO",
        label="Callum",
        age="older adult",
        gender="male",
        accent="British (London)",
    ),
]

# British/London-leaning default since the product is UK-facing.
DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"  # George

_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech"


def get_voice(voice_id: str) -> Voice | None:
    return next((v for v in VOICES if v.voice_id == voice_id), None)


async def synthesize(text: str, voice_id: str | None = None) -> bytes:
    """Speak `text` in the chosen voice and return raw mp3 bytes.

    Uses eleven_turbo_v2_5: this is spoken to a stranger mid-conversation, so latency
    matters more than the marginal quality gain from the non-turbo models.
    """
    if not settings.elevenlabs_api_key:
        raise RuntimeError(
            "ELEVENLABS_API_KEY is not set. Add it to your .env file to enable "
            "speech output (get a key at https://elevenlabs.io)."
        )

    resolved_voice_id = voice_id or DEFAULT_VOICE_ID

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{_BASE_URL}/{resolved_voice_id}",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            params={"output_format": "mp3_44100_128"},
            json={
                "text": text,
                "model_id": "eleven_turbo_v2_5",
            },
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"ElevenLabs TTS failed ({response.status_code}): {response.text}"
        )

    return response.content
