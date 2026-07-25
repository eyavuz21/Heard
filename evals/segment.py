"""Split the dysarthric-speech fixture into utterance-length chunks.

The product handles single short utterances ("one sentence to a barista"),
not 60-second monologues, so a single long recording is useless as an eval
fixture until it's cut into pieces of roughly that length. This script does
that cut using silence detection, tuned for dysarthric speech, which has
longer and more frequent pauses than typical fluent speech.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from pydub import AudioSegment
from pydub.silence import split_on_silence

FIXTURE = (
    Path(__file__).parent
    / "fixtures"
    / "angelas-accomplishments-spastic-cerebral-palsy-audio-quality-medium_u8pGo7w9.mp3"
)
OUTPUT_DIR = Path(__file__).parent / "fixtures" / "segments"

# Bounds for what counts as a usable single-utterance chunk.
MIN_KEEP_MS = 800  # below this, likely a breath or stray noise; drop it
MERGE_BELOW_MS = 1500  # below this, too short to be its own utterance; merge into a neighbour
TARGET_MAX_MS = 8000  # informational only, used in the summary/sanity check


def merge_short_chunks(chunks: list[AudioSegment], merge_below_ms: int) -> list[AudioSegment]:
    """Fold chunks shorter than merge_below_ms into an adjacent chunk.

    split_on_silence often produces a few very short fragments around brief
    disfluencies; on their own they aren't a usable utterance, so we glue
    them onto whichever neighbour is closer rather than discarding the audio.
    """
    if not chunks:
        return chunks

    merged: list[AudioSegment] = [chunks[0]]
    for chunk in chunks[1:]:
        if len(chunk) < merge_below_ms:
            merged[-1] = merged[-1] + chunk
        elif len(merged[-1]) < merge_below_ms:
            merged[-1] = merged[-1] + chunk
        else:
            merged.append(chunk)
    return merged


def segment(min_silence_len: int, thresh_offset: float, keep_silence: int) -> list[AudioSegment]:
    audio = AudioSegment.from_file(FIXTURE)
    silence_thresh = audio.dBFS + thresh_offset

    chunks = split_on_silence(
        audio,
        min_silence_len=min_silence_len,
        silence_thresh=silence_thresh,
        keep_silence=keep_silence,
    )
    chunks = merge_short_chunks(chunks, MERGE_BELOW_MS)
    chunks = [c for c in chunks if len(c) >= MIN_KEEP_MS]
    return chunks


def export(chunks: list[AudioSegment]) -> list[dict]:
    # Wipe and recreate so reruns with different params never leave stale segments.
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    index: list[dict] = []
    cursor_ms = 0
    for i, chunk in enumerate(chunks):
        chunk = chunk.set_channels(1).set_frame_rate(16000)
        name = f"seg_{i:02d}.mp3"
        chunk.export(OUTPUT_DIR / name, format="mp3")
        start_ms = cursor_ms
        end_ms = cursor_ms + len(chunk)
        index.append(
            {
                "file": name,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": len(chunk),
            }
        )
        cursor_ms = end_ms

    (OUTPUT_DIR / "index.json").write_text(json.dumps(index, indent=2))
    return index


def print_summary(index: list[dict]) -> None:
    print(f"{'file':<14}{'duration_ms':>14}")
    for entry in index:
        print(f"{entry['file']:<14}{entry['duration_ms']:>14}")

    total = sum(e["duration_ms"] for e in index)
    in_range = sum(1 for e in index if 1500 <= e["duration_ms"] <= TARGET_MAX_MS)
    print()
    print(f"segments: {len(index)}")
    print(f"in target range (1.5s-8s): {in_range}/{len(index)}")
    print(f"total covered duration: {total / 1000:.1f}s")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--min-silence",
        type=int,
        default=400,
        help="minimum length of silence (ms) that counts as a split point",
    )
    parser.add_argument(
        "--thresh-offset",
        type=float,
        default=-14.0,
        help="silence threshold as an offset (dB) from the clip's average dBFS",
    )
    parser.add_argument(
        "--keep-silence",
        type=int,
        default=250,
        help="padding (ms) of silence to keep at each chunk boundary",
    )
    args = parser.parse_args()

    chunks = segment(args.min_silence, args.thresh_offset, args.keep_silence)
    index = export(chunks)
    print_summary(index)


if __name__ == "__main__":
    main()
