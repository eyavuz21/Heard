"""Audio normalisation, which is what lets any browser talk to a model that only takes mp3.

The fragment case below is a real failure from the first live run, not a hypothetical:
Safari's MediaRecorder in timeslice mode emitted headerless MP4 fragments, ffmpeg refused
them, and the old code forwarded them to Gemini anyway -- turning a precise local error
into a 400 from Google and a 500 to the browser.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from app.recogniser import CANONICAL_MIME, UnusableAudio, normalise

FIXTURE = next(Path("evals/fixtures").glob("*.mp3"))


def _encode(fmt: str, seconds: int = 2) -> bytes:
    """Re-encode a slice of the real clip into `fmt`, standing in for a browser."""
    out = subprocess.run(
        ["ffmpeg", "-v", "quiet", "-i", str(FIXTURE), "-t", str(seconds), "-f", fmt, "pipe:1"],
        capture_output=True,
    )
    return out.stdout


def test_mp3_passes_through_untouched() -> None:
    """No pointless re-encode: it costs latency and a generation of quality."""
    audio = FIXTURE.read_bytes()
    data, mime = normalise(audio, "audio/mpeg")
    assert data == audio
    assert mime == CANONICAL_MIME


@pytest.mark.parametrize(
    "mime",
    [
        "audio/webm;codecs=opus",   # Chrome MediaRecorder
        "audio/mp4",                # Safari MediaRecorder
        "audio/mp4;codecs=mp4a.40.2",
        "audio/aac",
    ],
)
def test_browser_formats_become_mp3(mime: str) -> None:
    """Whatever the browser records, the model must see the format we tuned on."""
    raw = _encode("webm" if "webm" in mime else "adts")
    assert raw, "fixture encode failed -- check ffmpeg"

    data, out_mime = normalise(raw, mime)
    assert out_mime == CANONICAL_MIME
    assert data[:2] in (b"ID", b"\xff\xfb", b"\xff\xf3")  # ID3 tag or MPEG frame sync


def test_headerless_fragment_is_refused_not_forwarded() -> None:
    """A MediaRecorder timeslice fragment must fail here, loudly, and never reach Gemini.

    Forwarding it spends five paid calls to receive a generic 400, and reports a malformed
    recording as though the speaker could not be understood -- which is the one confusion
    this product cannot afford.
    """
    whole = _encode("webm")
    fragment = whole[len(whole) // 2:]  # no header, exactly like chunk 2 of a timeslice

    with pytest.raises(UnusableAudio):
        normalise(fragment, "audio/webm;codecs=opus")


def test_empty_payload_is_refused() -> None:
    with pytest.raises(UnusableAudio):
        normalise(b"", "audio/webm")
