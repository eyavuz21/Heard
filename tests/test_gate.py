"""Tests for the confidence gate.

These are offline and deterministic -- no API key needed. They pin the behaviours the
product's honesty claim depends on, particularly that a model insisting it is confident
cannot by itself produce a confident result.
"""

from __future__ import annotations

from app.config import settings
from app.gate import fuse, mean_pairwise_agreement, similarity
from app.models import RecognitionSample


def sample(best: str, confidence: float = 0.9, **kw) -> RecognitionSample:
    return RecognitionSample(best=best, confidence=confidence, **kw)


def test_unanimous_samples_are_confident() -> None:
    result = fuse([sample("a flat white please")] * 3, relay_id="r")
    assert result.best == "a flat white please"
    assert result.confidence > settings.confidence_threshold
    assert result.needs_confirmation is False


def test_self_reported_confidence_cannot_rescue_disagreement() -> None:
    """The central claim. Three samples that each swear they are 99% certain, but
    disagree completely, must not produce a confident answer -- otherwise the gate is
    just laundering the model's self-assessment."""
    result = fuse(
        [
            sample("where is the toilet", confidence=0.99),
            sample("i want a coffee", confidence=0.99),
            sample("my name is angela", confidence=0.99),
        ],
        relay_id="r",
    )
    assert result.confidence < settings.confidence_threshold
    assert result.needs_confirmation is True


def test_model_self_report_is_ignored_entirely() -> None:
    """Confidence is sample agreement and nothing else.

    Measured on real dysarthric audio, the model's own confidence field reported 0.98 on
    a 17%-wrong recovery and 0.98 on a 93%-wrong one. Identical agreement with wildly
    different self-reports must therefore produce identical confidence -- if this test
    fails, someone has wired the model's self-assessment back into the score.
    """
    humble = fuse([sample("a flat white please", confidence=0.01)] * 3, relay_id="r")
    boastful = fuse([sample("a flat white please", confidence=0.99)] * 3, relay_id="r")
    assert humble.confidence == boastful.confidence


def test_near_miss_scores_above_wholesale_disagreement() -> None:
    """Samples differing in one word should beat samples differing entirely -- exact
    match counting would score these the same, which is why agreement is pairwise."""
    near = fuse(
        [
            sample("a flat white please"),
            sample("a flat white thanks"),
            sample("a flat white please"),
        ],
        relay_id="r",
    )
    far = fuse(
        [sample("a flat white please"), sample("where is the bus"), sample("i am cold")],
        relay_id="r",
    )
    assert near.confidence > far.confidence


def test_majority_unintelligible_refuses_to_guess() -> None:
    """Silence or noise under a rich context must not yield a plausible sentence."""
    result = fuse(
        [
            sample("I could not make this out", confidence=0.1),
            sample("unintelligible", confidence=0.1),
            sample("a flat white please", confidence=0.8),
        ],
        relay_id="r",
    )
    assert result.best == ""
    assert result.confidence == 0.0
    assert result.needs_confirmation is True


def test_minority_refusal_does_not_veto_a_clear_majority() -> None:
    result = fuse(
        [
            sample("a flat white please"),
            sample("a flat white please"),
            sample("could not make out", confidence=0.1),
        ],
        relay_id="r",
    )
    assert result.best == "a flat white please"


def test_alternates_come_from_disagreeing_samples_and_exclude_the_answer() -> None:
    result = fuse(
        [
            sample("a flat white please"),
            sample("a flat white please"),
            sample("a flat white to go"),
        ],
        relay_id="r",
    )
    assert result.best == "a flat white please"
    assert "a flat white to go" in result.alternates
    assert "a flat white please" not in result.alternates


def test_word_options_come_from_position_votes() -> None:
    result = fuse(
        [
            sample("a flat white please"),
            sample("a black white please"),
            sample("a flat white please"),
        ],
        relay_id="r",
    )

    assert [word.word for word in result.words] == ["a", "flat", "white", "please"]
    flat = result.words[1]
    assert flat.alternatives == ["black"]
    assert flat.agreement == 0.667


def test_no_samples_returns_empty_not_a_guess() -> None:
    result = fuse([], relay_id="r")
    assert result.best == ""
    assert result.confidence == 0.0
    assert result.needs_confirmation is True


def test_uncertain_words_are_unioned_across_samples() -> None:
    result = fuse(
        [
            sample("a flat white please", uncertain_words=["flat"]),
            sample("a flat white please", uncertain_words=["white"]),
        ],
        relay_id="r",
    )
    assert set(result.uncertain_words) == {"flat", "white"}


def test_control_sample_catches_context_driven_fabrication() -> None:
    """Unanimous samples that all saw the same context can be unanimously wrong.

    Taken from a real observed failure: a 3-second clip of the speaker discussing her
    disability came back as a coffee order, because the other person had just said "flat
    white or latte?". All the contextual samples agreed. The control sample, run without
    the conversation, heard something entirely different -- which is the only signal that
    distinguishes this from a genuine recovery.
    """
    contextual = [sample("i think we will have a flat white")] * 4
    control = sample("my god we have had a hard time")

    without_check = fuse(contextual, relay_id="r")
    with_check = fuse(contextual, relay_id="r", control=control)

    assert without_check.confidence == 1.0  # agreement alone is fooled
    assert with_check.confidence < settings.confidence_threshold
    assert with_check.needs_confirmation is True


def test_control_sample_does_not_penalise_genuine_recovery() -> None:
    """Context legitimately resolves individual words. A control that broadly agrees
    must not drag down a good recovery, or the check makes the product worse."""
    contextual = [sample("a flat white please")] * 4
    control = sample("a flat wide please")  # same sentence, one word softer

    result = fuse(contextual, relay_id="r", control=control)
    assert result.confidence > settings.confidence_threshold
    assert result.needs_confirmation is False


def test_missing_control_leaves_confidence_untouched() -> None:
    """The control is a check, not the answer. If that call fails we proceed without it
    rather than penalising an utterance someone is waiting on."""
    contextual = [sample("a flat white please")] * 4
    assert fuse(contextual, relay_id="r", control=None).confidence == 1.0


def test_similarity_ignores_case_and_punctuation() -> None:
    assert similarity("A flat white, please.", "a flat white please") == 1.0


def test_agreement_of_single_sample_is_unity() -> None:
    assert mean_pairwise_agreement(["anything"]) == 1.0
