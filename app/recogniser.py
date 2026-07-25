"""The Gemini call. Audio in, structured recovery out.

One call per sample, N samples in parallel. Nothing clever happens here -- the cleverness
is in what prompt_compiler assembles and what gate does with the samples. This module is
deliberately thin so that it stays obvious what we are and are not doing: we are not
building an ASR model, we are asking an audio-native LLM a well-framed question.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging

from google import genai
from google.genai import types
from pydub import AudioSegment

from app.config import settings
from app.models import RecognitionSample

log = logging.getLogger(__name__)

# Everything we send to and receive from Gemini, verbatim, at DEBUG level. Separate from
# the module logger so it can be switched on alone -- this is high volume and you rarely
# want it mixed into ordinary application logs.
#
# PRIVACY: the prompt carries the conversation thread, which contains the other person's
# words. Attaching a FileHandler to this logger therefore writes a third party's speech
# to disk, which is exactly what we promised not to do. Console only unless you have
# deliberately decided otherwise for a debugging session.
call_log = logging.getLogger("relay.calls")


class UnusableAudio(ValueError):
    """The bytes we were given are not decodable audio.

    Raised rather than forwarded. ffmpeg decodes essentially everything, so if it cannot
    read these bytes then Gemini will not either -- passing them on only converts a clear
    local failure into an opaque 400 from Google, and on the relay path spends five paid
    calls doing it.

    The usual cause is a caller posting a MediaRecorder *fragment* instead of a complete
    recording. In timeslice mode only the first chunk carries the container header; the
    rest are headerless and not independently decodable.
    """


class RecognitionUnavailable(RuntimeError):
    """Every sample failed for infrastructure reasons -- no key, no network, API down.

    Deliberately distinct from "the model could not make out the audio". Conflating the
    two produces the worst possible debugging experience: a missing API key that looks
    exactly like a speech problem, in front of an audience.
    """

# Matches OUTPUT_SPEC in prompt_compiler. Enforced by the API rather than hoped for,
# because a malformed response mid-conversation is a dead demo.
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "best": {"type": "STRING"},
        "confidence": {"type": "NUMBER"},
        "alternates": {"type": "ARRAY", "items": {"type": "STRING"}},
        "uncertain_words": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": ["best", "confidence", "alternates", "uncertain_words"],
}

# What we hand Gemini, regardless of what the browser handed us. Every eval and tuning run
# was measured on mp3, so normalising here means the model sees in production exactly the
# format it was tuned against.
CANONICAL_MIME = "audio/mpeg"

# Formats we pass through untouched rather than re-encoding. mp3 is the canonical form;
# wav is lossless so a transcode would only cost latency.
PASSTHROUGH_MIMES = frozenset({"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"})


def normalise(audio: bytes, mime_type: str) -> tuple[bytes, str]:
    """Decode whatever the browser produced and re-encode it to mp3.

    Browsers do not agree on recording format: Chrome's MediaRecorder emits
    `audio/webm;codecs=opus`, Safari emits `audio/mp4`. Gemini's documented audio formats
    do not obviously include either container, and trusting a client-supplied
    `content_type` means the demo's success depends on which browser is open. ffmpeg
    decodes all of them, so we stop guessing and normalise.

    Costs roughly 200ms on a few seconds of audio, against a relay that already takes 10s
    or more.

    Raises UnusableAudio if the bytes cannot be decoded. Forwarding them instead would
    trade a precise local error for a generic 400 from Gemini -- see UnusableAudio.
    """
    if not audio:
        raise UnusableAudio("empty audio payload")

    base = mime_type.split(";")[0].strip().casefold()
    if base in PASSTHROUGH_MIMES:
        return audio, CANONICAL_MIME if base == "audio/mp3" else base

    try:
        segment = AudioSegment.from_file(io.BytesIO(audio))
        buffer = io.BytesIO()
        segment.export(buffer, format="mp3")
    except Exception as exc:  # noqa: BLE001 -- pydub raises bare Exception on ffmpeg failure
        raise UnusableAudio(
            f"could not decode {len(audio)} bytes of {mime_type}. If this came from "
            "MediaRecorder, check it is a complete recording rather than a timeslice "
            f"fragment: {exc}"
        ) from exc

    return buffer.getvalue(), CANONICAL_MIME


_client: genai.Client | None = None


def client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to .env -- see .env.example."
            )
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


async def recognise_once(
    audio: bytes,
    mime_type: str,
    prompt: str,
    temperature: float | None = None,
    model: str | None = None,
    thinking_level: str | None = None,
) -> RecognitionSample:
    """One recovery attempt."""
    model_name = model or settings.gemini_model
    temperature = settings.gate_temperature if temperature is None else temperature
    thinking = thinking_level or settings.thinking_level

    call_log.debug(
        "--> REQUEST model=%s temperature=%s thinking=%s audio=%s (%d bytes)\n%s\n",
        model_name,
        temperature,
        thinking,
        mime_type,
        len(audio),
        prompt,
    )

    response = await client().aio.models.generate_content(
        model=model_name,
        contents=[
            types.Part.from_bytes(data=audio, mime_type=mime_type),
            types.Part.from_text(text=prompt),
        ],
        config=types.GenerateContentConfig(
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=RESPONSE_SCHEMA,
            # Omitted entirely when unset, so the model's own default applies.
            thinking_config=(
                types.ThinkingConfig(thinking_level=thinking) if thinking else None
            ),
        ),
    )

    call_log.debug("<-- RESPONSE model=%s\n%s\n", model_name, response.text)
    return _parse(response.text)


async def recognise_samples(
    audio: bytes,
    mime_type: str,
    prompt: str,
    n: int | None = None,
    temperature: float | None = None,
    model: str | None = None,
    thinking_level: str | None = None,
) -> list[RecognitionSample]:
    """N recovery attempts in parallel.

    Parallel is the point: disagreement between samples is our confidence signal, and
    running them concurrently means N samples cost one call's worth of latency. Someone
    is standing at a counter waiting.

    Individual failures are tolerated -- we return whatever came back. But if every
    sample failed, that is an outage, not a recognition result, and we say so loudly
    rather than returning something the gate would render as "I couldn't hear you".
    """
    n = n or settings.gate_samples
    temperature = settings.gate_temperature if temperature is None else temperature
    audio, mime_type = normalise(audio, mime_type)

    async def bounded() -> RecognitionSample:
        return await asyncio.wait_for(
            recognise_once(audio, mime_type, prompt, temperature, model, thinking_level),
            timeout=settings.sample_timeout_seconds,
        )

    results = await asyncio.gather(
        *(bounded() for _ in range(n)), return_exceptions=True
    )

    samples: list[RecognitionSample] = []
    errors: list[BaseException] = []
    for result in results:
        if isinstance(result, BaseException):
            log.warning("recognition sample failed: %s", result)
            errors.append(result)
            continue
        samples.append(result)

    if not samples and errors:
        raise RecognitionUnavailable(f"all {len(errors)} samples failed: {errors[0]}")
    return samples


async def recognise_with_control(
    audio: bytes,
    mime_type: str,
    prompt: str,
    control_prompt: str,
) -> tuple[list[RecognitionSample], RecognitionSample | None]:
    """N-1 samples with context, plus one control sample with none, all in parallel.

    The control costs us one of the samples we were already paying for, and buys a much
    better signal than a further vote would: whether the answer survives losing the
    context. See gate.context_grounding.
    """
    n = max(1, settings.gate_samples - 1)
    # Once here, not once per sample: the contextual fan-out sees mp3 already and skips it.
    audio, mime_type = normalise(audio, mime_type)

    contextual, control = await asyncio.gather(
        recognise_samples(audio, mime_type, prompt, n=n),
        asyncio.wait_for(
            recognise_once(audio, mime_type, control_prompt, temperature=0.0),
            timeout=settings.sample_timeout_seconds,
        ),
        return_exceptions=True,
    )

    if isinstance(contextual, BaseException):
        raise contextual
    # A failed control must not fail the utterance -- it is a check, not the answer.
    if isinstance(control, BaseException):
        log.warning("control sample failed, proceeding without grounding check: %s", control)
        control = None

    return contextual, control


async def transcribe_ambient(audio: bytes, mime_type: str) -> str:
    """Transcribe the other speaker.

    This is typical speech, so it needs none of the recovery machinery -- a plain
    transcription is fine and we use the same model to avoid a second vendor.

    The caller must discard `audio` immediately after this returns. We never write it
    anywhere, and nothing derived from it is allowed into the user's profile.
    """
    audio, mime_type = normalise(audio, mime_type)
    response = await client().aio.models.generate_content(
        model=settings.gemini_model,
        contents=[
            types.Part.from_bytes(data=audio, mime_type=mime_type),
            types.Part.from_text(
                text=(
                    "Transcribe this audio verbatim. Return only the words spoken, with "
                    "no commentary, labels, or timestamps. If there is no intelligible "
                    "speech, return an empty string."
                )
            ),
        ],
        config=types.GenerateContentConfig(
            temperature=0.0,
            thinking_config=(
                types.ThinkingConfig(thinking_level=settings.thinking_level)
                if settings.thinking_level
                else None
            ),
        ),
    )
    return (response.text or "").strip()


def _parse(raw: str | None) -> RecognitionSample:
    if not raw:
        raise ValueError("empty response from model")
    data = json.loads(raw)
    # Clamp rather than reject: a model returning 1.2 is a nuisance, not a reason to
    # fail an utterance someone is waiting on.
    data["confidence"] = max(0.0, min(1.0, float(data.get("confidence", 0.0))))
    return RecognitionSample(**data)
