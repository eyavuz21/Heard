"""Generates the known-by-construction probe audio: silence and noise.

These are the only inputs in the whole eval suite whose correct answer we know for
certain, because we made them. We have no transcript for the real fixture, so this is
where an unambiguous pass/fail lives: given a rich coffee-shop context and no speech at
all, any confident drink order is a fabrication, full stop.
"""

from __future__ import annotations

import random
from pathlib import Path

from pydub import AudioSegment
from pydub.generators import WhiteNoise

PROBE_DIR = Path(__file__).parent / "fixtures" / "probes"


def build_probes() -> dict[str, Path]:
    """Writes the probe files and returns {name: path}. Idempotent."""
    PROBE_DIR.mkdir(parents=True, exist_ok=True)
    random.seed(0)  # reproducible runs

    probes = {
        "silence": AudioSegment.silent(duration=3000, frame_rate=16000),
        # Broadband noise at conversational level -- stands in for a room with no
        # speech in it. Quiet enough to be ambient, loud enough not to read as silence.
        "noise": WhiteNoise().to_audio_segment(duration=3000, volume=-30).set_frame_rate(16000),
        # Near-silence with a couple of non-speech thumps, which is what a phone in a
        # pocket sounds like and is the most likely accidental input in real use.
        "room_tone": _room_tone(),
    }

    out: dict[str, Path] = {}
    for name, audio in probes.items():
        path = PROBE_DIR / f"{name}.mp3"
        audio.set_channels(1).export(path, format="mp3")
        out[name] = path
    return out


def _room_tone() -> AudioSegment:
    base = WhiteNoise().to_audio_segment(duration=3000, volume=-48)
    thump = WhiteNoise().to_audio_segment(duration=80, volume=-24).fade_out(80)
    return (base.overlay(thump, position=700).overlay(thump, position=1900)).set_frame_rate(16000)


if __name__ == "__main__":
    for name, path in build_probes().items():
        print(f"{name:12} -> {path}")
