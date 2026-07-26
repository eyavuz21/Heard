"""ElevenLabs text-to-speech and optional Instant Voice Cloning.

Default readout voice is Emily. Users can opt into an Instant Voice Clone from the
Customise avatar flow; that cloned voice_id is then used for share/live speak-out.
"""

from __future__ import annotations

import httpx

from app.config import settings
from app.models import Voice

VOICES: list[Voice] = [
    Voice(
        voice_id="LcfcDJNUP1GQjkzn1xUU",
        label="Emily",
        age="young adult",
        gender="female",
        accent="American",
    ),
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

DEFAULT_VOICE_ID = "LcfcDJNUP1GQjkzn1xUU"  # Emily
DEFAULT_VOICE_LABEL = "Emily"

_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
_CLONE_URL = "https://api.elevenlabs.io/v1/voices/add"


class TtsUnavailable(RuntimeError):
    """Raised when ElevenLabs TTS or cloning cannot run."""


def get_voice(voice_id: str) -> Voice | None:
    return next((v for v in VOICES if v.voice_id == voice_id), None)


def resolve_voice_id(voice_id: str | None = None) -> str:
    return voice_id or DEFAULT_VOICE_ID


async def synthesize(text: str, voice_id: str | None = None) -> bytes:
    """Speak `text` in the chosen voice and return raw mp3 bytes.

    Uses eleven_turbo_v2_5: this is spoken to a stranger mid-conversation, so latency
    matters more than the marginal quality gain from the non-turbo models.
    """
    if not settings.elevenlabs_api_key:
        raise TtsUnavailable(
            "ELEVENLABS_API_KEY is not set. Add it to your .env file to enable "
            "speech output (get a key at https://elevenlabs.io)."
        )

    resolved_voice_id = resolve_voice_id(voice_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{_TTS_URL}/{resolved_voice_id}",
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
        raise TtsUnavailable(
            f"ElevenLabs TTS failed ({response.status_code}): {response.text}"
        )

    return response.content


async def clone_instant_voice(
    name: str,
    samples: list[tuple[str, bytes, str]],
) -> str:
    """Create an ElevenLabs Instant Voice Clone from one or more audio samples.

    `samples` are (filename, bytes, content_type). Returns the new voice_id.
    Browser recordings are normalised to mp3 first — ElevenLabs IVC rejects many
    webm/mp4 MediaRecorder containers.
    """
    from app.recogniser import UnusableAudio, normalise

    if not settings.elevenlabs_api_key:
        raise TtsUnavailable(
            "ELEVENLABS_API_KEY is not set. Add it to your .env file to enable "
            "voice cloning (get a key at https://elevenlabs.io)."
        )
    if not samples:
        raise TtsUnavailable("at least one audio sample is required")

    files: list[tuple[str, tuple[str, bytes, str]]] = []
    for index, (_filename, data, content_type) in enumerate(samples):
        try:
            mp3, mime = normalise(data, content_type or "audio/webm")
        except UnusableAudio as exc:
            raise TtsUnavailable(f"unusable audio sample: {exc}") from exc
        files.append(("files", (f"sample-{index + 1}.mp3", mp3, mime)))

    form = {
        "name": name,
        "description": "Heard user voice for share / avatar speak-out",
        "remove_background_noise": "true",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            _CLONE_URL,
            headers={"xi-api-key": settings.elevenlabs_api_key},
            data=form,
            files=files,
        )

    if response.status_code != 200:
        detail = response.text
        try:
            body = response.json()
            detail = body.get("detail") or body.get("message") or detail
        except Exception:  # noqa: BLE001
            pass
        raise TtsUnavailable(
            f"ElevenLabs voice clone failed ({response.status_code}): {detail}"
        )

    voice_id = response.json().get("voice_id")
    if not voice_id or not isinstance(voice_id, str):
        raise TtsUnavailable("ElevenLabs voice clone response missing voice_id")
    return voice_id
