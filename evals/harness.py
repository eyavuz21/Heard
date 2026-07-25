"""Shared machinery for the evals: load segments, run a recovery under a given context.

Kept separate from the tests so `run_probe.py` and the pytest suite drive exactly the
same code path, and a result printed for the pitch is the same result the tests assert on.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

from app import recogniser
from app.config import settings
from app.gate import fuse, similarity
from app.models import RelayResult
from app.prompt_compiler import ContextLevel, compiler, normalize

FIXTURES = Path(__file__).parent / "fixtures"
SEGMENTS = FIXTURES / "segments"


@dataclass
class Segment:
    name: str
    path: Path
    duration_ms: int


def load_segments(limit: int | None = None) -> list[Segment]:
    index_path = SEGMENTS / "index.json"
    if not index_path.exists():
        raise FileNotFoundError(
            f"{index_path} missing -- run `uv run python evals/segment.py` first."
        )
    entries = json.loads(index_path.read_text())
    segments = [
        Segment(name=e["file"], path=SEGMENTS / e["file"], duration_ms=e["duration_ms"])
        for e in entries
    ]
    return segments[:limit] if limit else segments


async def recover(
    audio_path: Path,
    scenario: dict | None,
    *,
    level: ContextLevel = ContextLevel.FULL,
    n: int = 1,
    temperature: float = 0.0,
    model: str | None = None,
) -> RelayResult:
    """Run one recovery under a given scenario.

    Defaults to a single deterministic sample: the stability comparison wants to isolate
    the effect of the context, so sampling noise is a confound here rather than a signal.
    The gate's own N-sample behaviour is exercised separately.
    """
    prompt = compiler.compile(
        level=level,
        pairs=scenario["pairs"] if scenario else None,
        vocabulary=scenario["vocabulary"] if scenario else None,
        thread=scenario["thread"] if scenario else None,
    ).text

    samples = await recogniser.recognise_samples(
        audio_path.read_bytes(),
        "audio/mpeg",
        prompt,
        n=n,
        temperature=temperature,
        model=model,
    )
    return fuse(samples, relay_id=f"eval-{audio_path.stem}")


async def timed_recover(*args, **kwargs) -> tuple[RelayResult, float]:
    """Recovery plus wall-clock seconds. Latency is a product requirement here, not a
    nice-to-have -- someone is standing at a counter -- so the model comparison has to
    report it alongside quality."""
    start = time.perf_counter()
    result = await recover(*args, **kwargs)
    return result, time.perf_counter() - start


def leaked_terms(text: str, terms: set[str]) -> set[str]:
    """Scenario-specific words that appeared in a recovery."""
    return set(normalize(text)) & terms


def drift(baseline: str, contextual: str) -> float:
    """0 = identical to the no-context baseline, 1 = completely different."""
    return 1.0 - similarity(baseline, contextual)


def have_api_key() -> bool:
    return bool(settings.gemini_api_key)
