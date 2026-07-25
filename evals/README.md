# evals

## Fixture

`fixtures/angelas-accomplishments-spastic-cerebral-palsy-audio-quality-medium_u8pGo7w9.mp3`

- 60.6s, 44.1kHz stereo, 320kbps.
- A real speech sample of a named third party with spastic cerebral palsy.
- **No ground-truth transcript exists.** WER and confidence-calibration
  metrics cannot be computed from it and must never be quoted or implied.
- Provenance and licence are **UNCONFIRMED** — establish rights before any
  public release, redistribution, or use outside this local eval workflow.

## segment.py

The product handles short single utterances (one sentence spoken to a
barista), not 60-second monologues, so the fixture is only useful once cut
into utterance-length chunks. `segment.py` splits on silence
(`pydub.silence.split_on_silence`), merges fragments under ~1.5s into a
neighbour, drops anything under 0.8s (breath/noise), downmixes to mono
16kHz, and exports mp3 chunks plus an `index.json` manifest.

Run: `uv run python evals/segment.py`

Tune via `--min-silence`, `--thresh-offset`, `--keep-silence` if the default
parameters (tuned for this fixture's longer dysarthric pauses) stop
producing sensible chunks. Current defaults yield 18 segments, 17 of 18
between 1.5s-8s, covering 57.3s of the 60.6s source.

`fixtures/segments/` is generated output, wiped and rebuilt on every run.

## Purpose

Segments are for context-swap confabulation testing: feeding short,
isolated dysarthric utterances through the transcription pipeline to see
whether the model invents plausible-sounding but wrong text rather than
signalling uncertainty, with no ground truth to score against.
