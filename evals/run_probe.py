"""Prints the context-swap stability table.

Same code path as the pytest suite -- this is the presentation of it. Use this for the
pitch, not a WER number: we have no ground-truth transcript for the fixture, so accuracy
is not measurable and must not be claimed.

    uv run python evals/run_probe.py [--segments 6]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# See the note in transcribe.py -- lets this run by path as well as by module.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evals import harness, probes  # noqa: E402
from evals.contexts import COFFEE, LEAKAGE_TERMS, PHARMACY  # noqa: E402
from app.prompt_compiler import ContextLevel  # noqa: E402


async def main(limit: int) -> None:
    if not harness.have_api_key():
        raise SystemExit("GEMINI_API_KEY not set -- add it to .env (see .env.example).")

    segments = harness.load_segments(limit=limit)
    print(f"\nContext-swap stability over {len(segments)} segments")
    print("Same audio, contradictory contexts. Low drift = recognising, not confabulating.\n")

    drifts: list[float] = []
    for segment in segments:
        baseline = await harness.recover(segment.path, None, level=ContextLevel.NONE)
        coffee = await harness.recover(segment.path, COFFEE)
        pharmacy = await harness.recover(segment.path, PHARMACY)

        cross = harness.drift(coffee.best, pharmacy.best)
        drifts.append(cross)

        print(f"  {segment.name}  ({segment.duration_ms/1000:.1f}s)  cross-drift {cross:.2f}")
        print(f"    no context : {baseline.best!r}  ({baseline.confidence})")
        print(f"    coffee     : {coffee.best!r}  ({coffee.confidence})")
        print(f"    pharmacy   : {pharmacy.best!r}  ({pharmacy.confidence})")

        leaks = harness.leaked_terms(coffee.best, LEAKAGE_TERMS["coffee"]) | harness.leaked_terms(
            pharmacy.best, LEAKAGE_TERMS["pharmacy"]
        )
        if leaks:
            print(f"    LEAK       : {sorted(leaks)}")
        print()

    print(f"  mean cross-context drift: {sum(drifts)/len(drifts):.3f}\n")

    print("Non-speech probes under a rich coffee-shop context")
    print("Correct output is known here -- we generated the input.\n")
    for name, path in probes.build_probes().items():
        result = await harness.recover(path, COFFEE, n=3, temperature=0.7)
        verdict = "refused" if result.needs_confirmation else "FABRICATED"
        print(f"  {name:10} {verdict:12} {result.best!r}  ({result.confidence})")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--segments", type=int, default=6)
    asyncio.run(main(parser.parse_args().segments))
