"""Print what the model hears on each segment. The first thing to run.

Before any stability metric means anything, you want to read the transcripts yourself and
judge whether they are plausible. We have no ground truth for this fixture, so your ear
and your judgement are the only check available.

    uv run python evals/transcribe.py                      # no context, all segments
    uv run python evals/transcribe.py --context coffee     # with a coffee-shop context
    uv run python evals/transcribe.py --model gemini-pro-latest
    uv run python evals/transcribe.py --segments 3 --samples 3

    # any audio file, including the whole 60s fixture
    uv run python evals/transcribe.py --file evals/fixtures/angelas-....mp3

Note that a long file is not what the product actually receives -- it handles one short
utterance spoken to a stranger, not a minute of continuous speech. Transcribing the whole
thing tells you whether the model can hear this speaker at all, which is worth knowing,
but the segments are the honest test of the real workload.

With --samples > 1 it prints every sample, not just the fused answer, so you can see the
disagreement the confidence score is built from. That disagreement is usually more
informative than the number.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import mimetypes
import sys
from pathlib import Path

# Makes `python evals/transcribe.py` work as well as `python -m evals.transcribe`.
# Invoking by path puts evals/ on sys.path rather than the repo root, so `app` and
# `evals` are both unimportable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from evals import harness  # noqa: E402
from evals.contexts import COFFEE, INTERVIEW, PHARMACY  # noqa: E402
from app import recogniser  # noqa: E402
from app.config import settings  # noqa: E402
from app.gate import fuse, mean_pairwise_agreement  # noqa: E402
from app.prompt_compiler import ContextLevel, compiler  # noqa: E402

SCENARIOS = {
    "none": None,
    "interview": INTERVIEW,  # the real context for the Angela fixture
    "coffee": COFFEE,
    "pharmacy": PHARMACY,
}


def _setup_tracing(args: argparse.Namespace) -> None:
    """Wire up verbatim request/response logging.

    Console by default. A log file is opt-in and warned about, because the prompt
    contains the conversation thread -- writing it to disk persists a third party's
    words, which the product otherwise never does.
    """
    if not (args.trace or args.log_file):
        return

    call_log = logging.getLogger("relay.calls")
    call_log.setLevel(logging.DEBUG)
    formatter = logging.Formatter("%(asctime)s %(message)s", datefmt="%H:%M:%S")

    if args.trace:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(formatter)
        call_log.addHandler(handler)

    if args.log_file:
        print(
            f"WARNING: writing prompts and responses to {args.log_file}. Prompts embed "
            "the conversation thread, so this persists the other speaker's words to "
            "disk. Delete it when you are done debugging.\n"
        )
        file_handler = logging.FileHandler(args.log_file)
        file_handler.setFormatter(formatter)
        call_log.addHandler(file_handler)


async def main(args: argparse.Namespace) -> None:
    if not harness.have_api_key():
        raise SystemExit("GEMINI_API_KEY not set -- add it to .env (see .env.example).")

    _setup_tracing(args)

    scenario = SCENARIOS[args.context]
    level = ContextLevel.NONE if scenario is None else ContextLevel.FULL
    model = args.model or settings.gemini_model

    if args.file:
        path = Path(args.file)
        if not path.exists():
            raise SystemExit(f"no such file: {path}")
        targets = [harness.Segment(name=path.name, path=path, duration_ms=0)]
    else:
        targets = harness.load_segments(limit=args.segments)

    prompt = compiler.compile(
        level=level,
        pairs=scenario["pairs"] if scenario else None,
        vocabulary=scenario["vocabulary"] if scenario else None,
        thread=scenario["thread"] if scenario else None,
    )

    temperature = settings.gate_temperature if args.temperature is None else args.temperature
    thinking = args.thinking or settings.thinking_level

    print(f"\nmodel    {model}  (thinking {thinking})")
    print(f"context  {args.context}  (sections: {', '.join(prompt.sections)})")
    print(f"samples  {args.samples} @ temperature {temperature}")
    print(f"audio    {len(targets)} file(s)\n")

    if args.show_prompt or args.dry_run:
        print("=" * 78)
        print("PROMPT SENT TO GEMINI (identical for every segment; audio differs)")
        print("=" * 78)
        print(prompt.text)
        print("=" * 78 + "\n")

    if args.dry_run:
        print(f"dry run -- no API calls made. {len(targets)} file(s) would have been sent.")
        return

    for segment in targets:
        mime = mimetypes.guess_type(segment.path.name)[0] or "audio/mpeg"
        samples = await recogniser.recognise_samples(
            segment.path.read_bytes(),
            mime,
            prompt.text,
            n=args.samples,
            temperature=temperature,
            model=model,
            thinking_level=thinking,
        )
        result = fuse(samples, relay_id=segment.name)

        flag = "" if result.best.strip() else "   [declined to guess]"
        length = f" ({segment.duration_ms/1000:.1f}s)" if segment.duration_ms else ""
        print(f"{segment.name}{length}{flag}")
        print(f'  "{result.best}"')
        print(f"  confidence {result.confidence}   confirm={result.needs_confirmation}")

        if result.uncertain_words:
            print(f"  unsure of: {', '.join(result.uncertain_words)}")
        if result.alternates:
            for alt in result.alternates:
                print(f"  alt: {alt!r}")
        if args.samples > 1:
            agreement = mean_pairwise_agreement([s.best for s in samples])
            print(f"  raw samples (agreement {agreement:.2f}):")
            for s in samples:
                print(f"    [{s.confidence:.2f}] {s.best!r}")
        print()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--context", choices=list(SCENARIOS), default="none")
    p.add_argument("--model", default=None)
    p.add_argument("--file", default=None, help="transcribe this audio file instead of the segments")
    p.add_argument("--segments", type=int, default=None, help="limit; default all")
    # Defaults to the production sample count so a bare run exercises the real gate --
    # consensus and disagreement only exist with more than one sample.
    p.add_argument("--samples", type=int, default=settings.gate_samples)
    p.add_argument("--temperature", type=float, default=None, help="default: config")
    p.add_argument("--thinking", choices=["MINIMAL", "LOW", "MEDIUM", "HIGH"], default=None)
    p.add_argument("--show-prompt", action="store_true", help="print the assembled prompt")
    p.add_argument("--dry-run", action="store_true", help="print the prompt and exit, no API calls")
    p.add_argument("--trace", action="store_true", help="print every request and response verbatim")
    p.add_argument("--log-file", default=None, help="also append the trace to this file (see privacy warning)")
    asyncio.run(main(p.parse_args()))
