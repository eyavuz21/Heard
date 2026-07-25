"""Grid search over model, temperature, context and prompt style. Scored by WER.

THROWAWAY TUNING TOOL. Its only job is to pick the model and prompt; once those are
locked into config.py and prompt_compiler.py, this file and truth.py can be deleted. It
deliberately lives entirely in evals/ and nothing in app/ imports it, so removing it
cannot break the product.

    uv run python evals/sweep.py --quick
    uv run python evals/sweep.py --models gemini-flash-latest,gemini-pro-latest
    uv run python evals/sweep.py --dry-run          # show the grid, spend nothing

Reading the output:
  WER          lower is better. Insertions are called out separately because a word we
               invented is worse than a word we dropped -- one puts language in the
               speaker's mouth, the other just fails.
  conf         what the model claimed. Compare across rows: if a high-WER row reports
               the same confidence as a low-WER row, the confidence signal is not
               discriminating and the gate should lean on sample disagreement instead.

Warning: one clip, one speaker. Tuning hard against this will overfit to Angela. Treat
the winner as a hypothesis, and prefer settings that win by a clear margin over ones that
edge ahead by a point or two.
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evals import harness, truth  # noqa: E402
from evals.contexts import INTERVIEW  # noqa: E402
from app import recogniser  # noqa: E402
from app.gate import fuse  # noqa: E402
from app.prompt_compiler import ContextLevel, compiler  # noqa: E402

FIXTURE = (
    harness.FIXTURES
    / "angelas-accomplishments-spastic-cerebral-palsy-audio-quality-medium_u8pGo7w9.mp3"
)

# A deliberately terse alternative to the production framing, to test whether ~1500
# characters of careful instruction actually helps or just dilutes attention on the
# audio. Lives here rather than in prompt_compiler because it is a tuning question; if it
# wins clearly, fold the wording back into the real compiler and delete this.
LEAN_PROMPT = """\
Transcribe this dysarthric speech. The speaker's language is intact; only their
articulation is impaired. Recover their exact words.

The audio is the evidence. Any context below is a hint, not a constraint -- transcribe
what is actually said even if it does not fit. If it is silent or unintelligible, say so
and return low confidence. Never invent a plausible sentence.

Return JSON: {"best": str, "confidence": float 0-1, "alternates": [str],
"uncertain_words": [str]}. `confidence` is your genuine probability that `best` is
word-for-word correct; be willing to go low."""


# The user's own prompt from Google AI Studio, verbatim including its typos -- if it
# performs well despite them, that is worth knowing, and tidying them up would change
# what we are measuring. Note what it does NOT contain: any permission to refuse, and any
# anti-confabulation instruction. It embeds its own context, so run it with context=none.
SANDBOX_PROMPT = """\
You are acting as n ai agent which you are responsible to help people with speech \
impairment, try to understand what they are saying based on the context and the give the \
transcribe of what the person is trying to say.
CONTEXT:
question from PERSON A to PERSON B: Angela what do you want to tell the world?
it is person B's turn to respond and you have to transcribe what they are trying to say.
(Person B has speech impairment)

Return JSON: {"best": str, "confidence": float 0-1, "alternates": [str], \
"uncertain_words": [str]}. `confidence` is your genuine probability that `best` is \
word-for-word correct."""


def build_prompt(style: str, context: str) -> str:
    scenario = INTERVIEW if context == "interview" else None
    level = ContextLevel.FULL if scenario else ContextLevel.NONE

    if style == "sandbox":
        return SANDBOX_PROMPT  # carries its own context; ignores the context axis

    if style == "lean":
        prompt = LEAN_PROMPT
        if scenario:
            thread = "\n".join(f"  OTHER PERSON: {t.text}" for t in scenario["thread"])
            prompt += f"\n\nCONVERSATION SO FAR\n{thread}"
        return prompt

    return compiler.compile(
        level=level,
        pairs=scenario["pairs"] if scenario else None,
        vocabulary=scenario["vocabulary"] if scenario else None,
        thread=scenario["thread"] if scenario else None,
    ).text


async def run_cell(
    audio: bytes, model: str, temperature: float, thinking: str, style: str, context: str
) -> tuple[truth.WER, float, str]:
    prompt = build_prompt(style, context)
    samples = await recogniser.recognise_samples(
        audio, "audio/mpeg", prompt, n=1, temperature=temperature, model=model,
        thinking_level=thinking,
    )
    result = fuse(samples, relay_id="sweep")
    return truth.word_error_rate(truth.REFERENCE, result.best), result.confidence, result.best


async def main(args: argparse.Namespace) -> None:
    grid = list(
        itertools.product(
            args.models.split(","),
            [float(t) for t in args.temperatures.split(",")],
            args.thinking.split(","),
            args.styles.split(","),
            args.contexts.split(","),
        )
    )

    print(f"\n{len(grid)} configurations x 1 call each")
    print(f"fixture: {FIXTURE.name}")
    print(f"reference: {len(truth.tokenize(truth.REFERENCE))} words\n")

    if args.dry_run:
        for model, temp, think, style, context in grid:
            print(f"  {model:22} T={temp:<4} think={think:<7} {style:5} {context}")
        print("\ndry run -- no API calls made.")
        return

    if not harness.have_api_key():
        raise SystemExit("GEMINI_API_KEY not set -- add it to .env.")
    if not FIXTURE.exists():
        raise SystemExit(f"fixture missing: {FIXTURE}")

    audio = FIXTURE.read_bytes()
    rows: list[tuple[float, str, truth.WER, float, str]] = []

    for model, temp, think, style, context in grid:
        label = f"{model} T={temp} think={think} {style}/{context}"
        try:
            wer, confidence, text = await run_cell(audio, model, temp, think, style, context)
        except Exception as exc:  # a dead model id should not kill the whole sweep
            print(f"  FAIL  {label}: {type(exc).__name__}: {str(exc)[:120]}")
            continue

        rows.append((wer.wer, label, wer, confidence, text))
        print(f"  {wer.wer:6.1%}  conf {confidence:.2f}  {label}")

    if not rows:
        raise SystemExit("\nevery configuration failed.")

    rows.sort(key=lambda r: r[0])
    print("\n" + "=" * 78)
    print("RANKED (best first)")
    print("=" * 78)
    for _, label, wer, confidence, text in rows:
        print(f"\n{label}")
        print(f"  {wer}  confidence {confidence:.2f}")
        print(f"  {text!r}")

    print("\n" + "=" * 78)
    print(f"REFERENCE\n  {' '.join(truth.REFERENCE.split())!r}")
    print("=" * 78 + "\n")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--models", default="gemini-flash-latest,gemini-pro-latest")
    p.add_argument("--temperatures", default="0,1")
    p.add_argument("--thinking", default="HIGH")
    p.add_argument("--styles", default="full,lean", help="prompt style")
    p.add_argument("--contexts", default="none,interview")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--quick",
        action="store_true",
        help="one model, one temperature -- 4 calls instead of 16",
    )
    args = p.parse_args()
    if args.quick:
        args.models, args.temperatures = "gemini-flash-latest", "0"
    asyncio.run(main(args))
