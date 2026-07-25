"""Fuses several recognition samples into one answer plus an honest confidence.

Why this exists: a model's self-reported `confidence` grades its own homework, and in
practice it tends to bunch up near the top regardless of whether the answer is right.
Disagreement between independent samples is a different kind of evidence -- it comes from
the model's behaviour rather than its self-assessment -- so we weight it more heavily.

A useful side effect: when the samples disagree, the disagreement itself produces the
alternates we show the user. Those are better options than asking one sample to invent
alternates, because each came from a genuine, independent reading of the same audio.

Note what this is not. It is not a safety mechanism. Nothing is ever spoken without a
confirm tap, so a bad score here costs the user a wasted tap, not a sentence they did not
say. It decides how to present, not whether to speak.
"""

from __future__ import annotations

from collections import Counter
from difflib import SequenceMatcher

from app.config import settings
from app.models import RecognitionSample, RelayResult
from app.prompt_compiler import normalize

# Confidence is sample agreement, full stop. The model's own `confidence` field is read
# and stored but contributes nothing, because measurement on real dysarthric audio showed
# it carries no information: it reported 0.98 on a recovery that was 17% wrong and 0.98
# on one that was 93% wrong, and 0.94 on the run that put a slur in the speaker's mouth.
# Blending a signal that does not discriminate only adds variance to one that does.
AGREEMENT_WEIGHT = 1.0
SELF_REPORT_WEIGHT = 0.0

# Below this much overlap with the no-context control, we treat the context as having
# written the answer and scale confidence down by the overlap. Set permissively: context
# legitimately changes a word or two, and we only want to fire when it has changed the
# sentence.
GROUNDING_FLOOR = 0.6

# Phrasings the prompt explicitly invites when the audio is silence or noise. If the
# model takes that option we honour it rather than averaging it away -- this is the
# behaviour that stops us confabulating on an empty room, so it must not be smoothed out.
UNINTELLIGIBLE_MARKERS = (
    "could not make",
    "couldn't make",
    "unintelligible",
    "no speech",
    "no intelligible",
    "inaudible",
    "cannot make out",
    "can't make out",
)


def similarity(a: str, b: str) -> float:
    """Token-level similarity, 0-1. Shared by the gate and the evals so both agree on
    what counts as 'the same sentence'."""
    ta, tb = normalize(a), normalize(b)
    if not ta and not tb:
        return 1.0
    if not ta or not tb:
        return 0.0
    return SequenceMatcher(None, ta, tb).ratio()


def is_unintelligible(text: str) -> bool:
    lowered = text.casefold()
    return not lowered.strip() or any(m in lowered for m in UNINTELLIGIBLE_MARKERS)


def mean_pairwise_agreement(texts: list[str]) -> float:
    """Average similarity across every pair of samples.

    Pairwise rather than 'how many exactly matched the mode', because near-misses carry
    real information: three samples differing only in one uncertain word is a much
    stronger result than three samples that disagree wholesale, and exact-match counting
    would score both identically.
    """
    if len(texts) < 2:
        return 1.0
    scores = [
        similarity(texts[i], texts[j])
        for i in range(len(texts))
        for j in range(i + 1, len(texts))
    ]
    return sum(scores) / len(scores)


def context_grounding(contextual: str, control: str) -> float:
    """How much of the answer came from the audio rather than the prompt. 0-1.

    Measured by running one sample with no context at all and comparing. If dropping the
    conversation changes the answer completely, the conversation wrote the answer.

    This is a sharper question than "do the samples agree with each other", because
    samples sharing a context can all be pulled toward the same plausible invention and
    agree enthusiastically about it. Observed live: a 3-second clip of the speaker
    discussing her disability came back as "i think we'll have a flat white" purely
    because the other person had said "flat white or latte?". The control sample for that
    same audio said "my god we have had a hard time" -- near-zero overlap, which is the
    signature this catches.

    Returns 1.0 when there is no control sample, so callers that skip the control are
    unaffected rather than silently penalised.
    """
    if not control.strip() or not contextual.strip():
        return 1.0
    return similarity(contextual, control)


def fuse(
    samples: list[RecognitionSample],
    relay_id: str,
    control: RecognitionSample | None = None,
) -> RelayResult:
    if not samples:
        # Every sample failed. Say so plainly rather than returning a guess.
        return RelayResult(
            relay_id=relay_id,
            best="",
            confidence=0.0,
            alternates=[],
            uncertain_words=[],
            needs_confirmation=True,
        )

    best_texts = [s.best for s in samples]

    # If the model declined to guess, that is the answer. Don't let a majority of
    # confident-but-different hallucinations outvote an honest refusal.
    unintelligible = [t for t in best_texts if is_unintelligible(t)]
    if len(unintelligible) * 2 >= len(best_texts):
        return RelayResult(
            relay_id=relay_id,
            best="",
            confidence=0.0,
            alternates=_collect_alternates(samples, exclude=""),
            uncertain_words=[],
            needs_confirmation=True,
        )

    text, uncertain, word_agreement = consensus(best_texts)
    if not text:
        text = _modal(best_texts)

    confidence = word_agreement

    # Agreement among samples that all saw the same context can be agreement about the
    # same fabrication. The control sample -- run with no context -- is the check on
    # that, and it can only ever lower confidence, never raise it.
    grounding = context_grounding(text, control.best if control else "")
    if grounding < GROUNDING_FLOOR:
        confidence *= grounding

    # A single sample has nothing to agree with, so its "agreement" is vacuous -- it is
    # 1.0 by construction. Left unchecked that manufactures certainty from nothing: it is
    # what let a fabricated sentence come back at 0.95 and pass the gate. Cap it.
    if len(samples) == 1:
        confidence = min(confidence, settings.confidence_threshold - 0.01)

    return RelayResult(
        relay_id=relay_id,
        best=text,
        confidence=round(confidence, 3),
        alternates=_collect_alternates(samples, exclude=text),
        uncertain_words=uncertain or _collect_uncertain(samples),
        needs_confirmation=confidence < settings.confidence_threshold,
    )


def _align_to(backbone: list[str], other: list[str]) -> list[str | None]:
    """For each backbone position, what `other` has at that position (None if nothing).

    Insertions in `other` are dropped rather than voted on. That is deliberate: a word
    only one sample heard is exactly the kind of invention we do not want promoted into
    the answer.
    """
    out: list[str | None] = [None] * len(backbone)
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, backbone, other).get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                out[i1 + k] = other[j1 + k]
        elif tag == "replace":
            for k in range(i2 - i1):
                if j1 + k < j2:
                    out[i1 + k] = other[j1 + k]
    return out


def consensus(texts: list[str], min_support: float = 0.5) -> tuple[str, list[str], float]:
    """Build one transcript by voting word by word across samples.

    Picking a single best sample throws away information: in testing, different samples
    got different spans right -- one recovered the opening, another the ending. Voting per
    position assembles the best-supported reading from all of them.

    Two things fall out of this for free:
      - Words where the samples disagree become `uncertain_words`, derived from actual
        disagreement rather than the model's self-report, which measured as worthless.
      - A word only a minority heard gets dropped rather than spoken. Silence about a
        word we are unsure of beats inventing one.

    Returns (text, uncertain_words, mean per-word agreement).
    """
    token_lists = [normalize(t) for t in texts if t.strip()]
    if not token_lists:
        return "", [], 0.0
    if len(token_lists) == 1:
        return texts[0], [], 1.0

    # Backbone is the sample closest to all the others -- the consensus middle rather
    # than whichever happened to be generated first.
    backbone_idx = max(
        range(len(token_lists)),
        key=lambda i: sum(
            SequenceMatcher(None, token_lists[i], other).ratio() for other in token_lists
        ),
    )
    backbone = token_lists[backbone_idx]
    others = [t for i, t in enumerate(token_lists) if i != backbone_idx]
    aligned = [_align_to(backbone, other) for other in others]

    words: list[str] = []
    uncertain: list[str] = []
    agreements: list[float] = []

    for position, word in enumerate(backbone):
        votes = [word] + [a[position] for a in aligned]
        present = [v for v in votes if v is not None]
        counts = Counter(present)
        winner, support = counts.most_common(1)[0]
        share = support / len(votes)
        agreements.append(share)

        # Fewer than half the samples heard anything here -- drop it rather than speak
        # a word most of the evidence does not support.
        if len(present) / len(votes) < min_support:
            continue

        words.append(winner)
        if share < 1.0:
            uncertain.append(winner)

    text = " ".join(words)
    mean_agreement = sum(agreements) / len(agreements) if agreements else 0.0
    return text, uncertain, mean_agreement


def _modal(texts: list[str]) -> str:
    """The reading with the most support.

    Ties break toward the sample most similar to all the others, i.e. the consensus
    middle, rather than toward whichever happened to be generated first.
    """
    counts = Counter(" ".join(normalize(t)) for t in texts)
    top = counts.most_common(1)[0][1]
    contenders = [t for t in texts if counts[" ".join(normalize(t))] == top]
    if len(contenders) == 1:
        return contenders[0]
    return max(
        contenders,
        key=lambda c: sum(similarity(c, other) for other in texts),
    )


def _collect_alternates(
    samples: list[RecognitionSample], exclude: str, limit: int = 3
) -> list[str]:
    """Distinct readings, disagreement-derived first.

    A competing sample's `best` is a stronger option than an `alternate` the model
    invented alongside its own answer, so those go first.
    """
    seen = {" ".join(normalize(exclude))}
    out: list[str] = []

    for candidate in [s.best for s in samples] + [
        alt for s in samples for alt in s.alternates
    ]:
        key = " ".join(normalize(candidate))
        if not key or key in seen or is_unintelligible(candidate):
            continue
        seen.add(key)
        out.append(candidate)
        if len(out) == limit:
            break
    return out


def _collect_uncertain(samples: list[RecognitionSample]) -> list[str]:
    """Words any sample flagged. Union rather than intersection -- if one reading
    doubted a word, the interface should highlight it."""
    seen: set[str] = set()
    out: list[str] = []
    for sample in samples:
        for word in sample.uncertain_words:
            key = word.casefold()
            if key not in seen:
                seen.add(key)
                out.append(word)
    return out
