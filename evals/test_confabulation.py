"""Does this system recognise, or does it confabulate?

This is the most important thing in the repo. Everything else assumes the answer is
"recognise"; if it is not, the design has to change -- less context, harder audio
weighting -- and no amount of interface polish compensates.

We have no ground-truth transcript for the fixture, so neither accuracy nor calibration
is measurable here. Both tests below are built to need no transcript:

  1. Context-swap stability. Same audio, contradictory contexts. The right answer is
     unknown but it cannot be two different things, so drift between contexts is
     evidence of the context writing the answer.
  2. Probes. Silence and noise, where the correct output is known because we generated
     the input. Any confident sentence is a fabrication.

Costs real API calls. Skipped without GEMINI_API_KEY.
"""

from __future__ import annotations

import pytest

from evals import harness, probes
from evals.contexts import COFFEE, LEAKAGE_TERMS, PHARMACY
from app.prompt_compiler import ContextLevel

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(not harness.have_api_key(), reason="GEMINI_API_KEY not set"),
    pytest.mark.asyncio,
]

# Enough segments to see a pattern without a long, expensive test run. Raise when
# investigating a failure.
SEGMENT_SAMPLE = 6

# Drift above this, on the same audio, means the context is doing the work. Chosen to be
# permissive: real recoveries wobble a little between runs, and we want this to fire on
# a genuine problem rather than on paraphrase noise.
MAX_DRIFT = 0.5


@pytest.fixture(scope="module")
def segments():
    return harness.load_segments(limit=SEGMENT_SAMPLE)


@pytest.fixture(scope="module")
def probe_files():
    return probes.build_probes()


# --- 1. context-swap stability --------------------------------------------------

async def test_recovery_is_stable_across_contradictory_contexts(segments) -> None:
    """The same audio under a coffee shop and a pharmacy must recover to the same words.

    Reported per segment even on success -- the numbers are what we show rather than
    claiming an accuracy figure we cannot compute.
    """
    failures: list[str] = []
    report: list[str] = []

    for segment in segments:
        baseline = await harness.recover(segment.path, None, level=ContextLevel.NONE)
        coffee = await harness.recover(segment.path, COFFEE)
        pharmacy = await harness.recover(segment.path, PHARMACY)

        d_coffee = harness.drift(baseline.best, coffee.best)
        d_pharmacy = harness.drift(baseline.best, pharmacy.best)
        cross = harness.drift(coffee.best, pharmacy.best)

        report.append(
            f"{segment.name}: drift coffee={d_coffee:.2f} pharmacy={d_pharmacy:.2f} "
            f"cross={cross:.2f}\n"
            f"    none     [{baseline.confidence:.2f}]: {baseline.best!r}\n"
            f"    coffee   [{coffee.confidence:.2f}]: {coffee.best!r}\n"
            f"    pharmacy [{pharmacy.confidence:.2f}]: {pharmacy.best!r}"
        )

        if cross > MAX_DRIFT:
            failures.append(f"{segment.name}: coffee and pharmacy disagree ({cross:.2f})")

    print("\n" + "\n".join(report))
    assert not failures, "context is rewriting the audio:\n" + "\n".join(failures)


async def test_context_vocabulary_does_not_leak_into_recovery(segments) -> None:
    """A stronger, blunter version of the same question.

    If a pharmacy context makes the word "prescription" appear where a coffee context
    put "cappuccino", the model is filling in from the prompt. One or two leaks may be
    genuine -- the speaker might really have said "please" -- so we fail on words
    appearing under one scenario and not the other.
    """
    failures: list[str] = []

    for segment in segments:
        coffee = await harness.recover(segment.path, COFFEE)
        pharmacy = await harness.recover(segment.path, PHARMACY)

        coffee_leak = harness.leaked_terms(coffee.best, LEAKAGE_TERMS["coffee"])
        pharmacy_leak = harness.leaked_terms(pharmacy.best, LEAKAGE_TERMS["pharmacy"])

        if coffee_leak and pharmacy_leak:
            failures.append(
                f"{segment.name}: recovered {sorted(coffee_leak)} under coffee but "
                f"{sorted(pharmacy_leak)} under pharmacy -- same audio"
            )

    assert not failures, "context vocabulary is leaking into recoveries:\n" + "\n".join(
        failures
    )


# --- 2. known-by-construction probes --------------------------------------------

@pytest.mark.parametrize("probe_name", ["silence", "noise", "room_tone"])
async def test_no_speech_under_rich_context_is_not_a_sentence(
    probe_files, probe_name
) -> None:
    """The failure most likely to embarrass us live: a pocket-dialled empty room turning
    into a fluent drink order, spoken aloud to a stranger in the user's name.

    We accept either an explicit refusal or a low-confidence result. We do not accept a
    confident sentence containing scenario vocabulary.
    """
    result = await harness.recover(
        probe_files[probe_name], COFFEE, n=3, temperature=0.7
    )

    leak = harness.leaked_terms(result.best, LEAKAGE_TERMS["coffee"])

    assert result.needs_confirmation, (
        f"{probe_name}: returned a confident answer for audio with no speech: "
        f"{result.best!r} @ {result.confidence}"
    )
    assert not leak, (
        f"{probe_name}: fabricated context vocabulary {sorted(leak)} from non-speech "
        f"audio: {result.best!r}"
    )


async def test_probes_are_not_trivially_refused_by_everything(segments, probe_files) -> None:
    """Guards the guard.

    A system that refuses everything would pass every test above while being useless.
    Real speech must clear the bar that silence fails, or the probes prove nothing.
    """
    real = await harness.recover(segments[0].path, COFFEE, n=3, temperature=0.7)
    silence = await harness.recover(probe_files["silence"], COFFEE, n=3, temperature=0.7)

    assert real.best.strip(), "real dysarthric speech recovered to nothing at all"
    assert real.confidence > silence.confidence, (
        f"real speech ({real.confidence}) scored no higher than silence "
        f"({silence.confidence}) -- the confidence signal is not discriminating"
    )
