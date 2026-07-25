"""Flash vs Pro, on our actual audio, under our actual prompt.

Settles the model question with numbers instead of priors. Run before committing to
either -- the answer is not obvious, and it is specific to dysarthric audio rather than
to general benchmarks.

    uv run python evals/compare_models.py --a gemini-flash-latest --b gemini-pro-latest

What it reports, and why each one matters:

  agreement   Mean pairwise similarity across N samples of the same audio. Our confidence
              signal is built on this, so a model that samples inconsistently gives us a
              worse gate even if its single best answer is better.
  cross-model Similarity between the two models' recoveries. High means they agree on
              what was said, which -- with no ground truth -- is the closest thing we
              have to evidence that either is right.
  latency     Wall clock for N parallel samples. The product constraint: someone is
              waiting at a counter.
  refusals    How often each declines to guess. A model that never refuses cannot be
              trusted to refuse when it matters.

Note the tradeoff this is really measuring. If the slower model forces N down to 1, we
lose the agreement signal entirely -- so a per-call accuracy win does not automatically
make it the better choice for this product.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# See the note in transcribe.py -- lets this run by path as well as by module.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evals import harness  # noqa: E402
from evals.contexts import COFFEE  # noqa: E402
from app.config import settings  # noqa: E402
from app.gate import similarity  # noqa: E402


async def main(model_a: str, model_b: str, limit: int, n: int) -> None:
    if not harness.have_api_key():
        raise SystemExit("GEMINI_API_KEY not set -- add it to .env (see .env.example).")

    segments = harness.load_segments(limit=limit)
    print(f"\n{model_a}  vs  {model_b}")
    print(f"{len(segments)} segments, {n} samples each, coffee-shop context\n")

    stats: dict[str, dict[str, list[float]]] = {
        m: {"latency": [], "confidence": [], "refusals": []} for m in (model_a, model_b)
    }
    cross: list[float] = []

    for segment in segments:
        row = {}
        for model in (model_a, model_b):
            result, elapsed = await harness.timed_recover(
                segment.path, COFFEE, n=n, temperature=settings.gate_temperature, model=model
            )
            row[model] = result
            stats[model]["latency"].append(elapsed)
            stats[model]["confidence"].append(result.confidence)
            stats[model]["refusals"].append(0.0 if result.best.strip() else 1.0)

        agreement = similarity(row[model_a].best, row[model_b].best)
        cross.append(agreement)

        print(f"  {segment.name} ({segment.duration_ms/1000:.1f}s)  cross-model {agreement:.2f}")
        for model in (model_a, model_b):
            r = row[model]
            print(f"    {model:24} {r.best!r}  conf={r.confidence}")
        print()

    print("summary")
    for model in (model_a, model_b):
        s = stats[model]
        print(
            f"  {model:24} "
            f"latency {_mean(s['latency']):.2f}s  "
            f"mean conf {_mean(s['confidence']):.3f}  "
            f"refused {int(sum(s['refusals']))}/{len(segments)}"
        )
    print(f"\n  mean cross-model agreement: {_mean(cross):.3f}")
    print(
        "\n  Reading this: high cross-model agreement means both models hear the same "
        "thing,\n  which is weak evidence they are both right. Low agreement means at "
        "least one is\n  wrong and we cannot tell which -- with no transcript, that is "
        "a reason for caution,\n  not a reason to pick the more expensive one.\n"
    )


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--a", default="gemini-flash-latest")
    p.add_argument("--b", default="gemini-pro-latest")
    p.add_argument("--segments", type=int, default=6)
    p.add_argument("--samples", type=int, default=settings.gate_samples)
    args = p.parse_args()
    asyncio.run(main(args.a, args.b, args.segments, args.samples))
