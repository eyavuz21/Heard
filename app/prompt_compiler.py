"""Assembles the context that goes into the recognition call.

This is the actual contribution of the system. The recogniser is one Gemini call with
audio attached; what makes it work on dysarthric speech is what we put around the audio
-- the user's own confirmed corrections, their vocabulary, and what the other person just
said. This module owns that assembly and nothing else.

Deliberately pure: no network, no FastAPI, no I/O. It takes data and returns a string, so
the confabulation eval can drive it directly and vary one input at a time.

The ordering below is load-bearing. The instruction to trust the audio over the context
comes FIRST, before any context is introduced, so it frames everything that follows
rather than trailing after a page of suggestive material.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

from app.models import ConfirmedPair, Speaker, Turn


class ContextLevel(str, Enum):
    """How much context to inject.

    Exists so the confabulation eval can sweep it, and so we have a dial to turn down
    if the model turns out to be pattern-matching the context instead of listening.
    NONE is also the honest baseline for measuring what the context is worth.
    """

    NONE = "none"          # audio only -- baseline
    MINIMAL = "minimal"    # confirmed pairs only, no conversation
    FULL = "full"          # everything


# Stated before any context appears. The second half matters as much as the first:
# confabulating on silence is the failure most likely to embarrass us in front of a
# real person, and a model that will not say "I don't know" cannot be trusted to speak.
# Kept deliberately short. A longer version of this -- three paragraphs explaining
# dysarthria and five bullets on confabulation -- measured materially WORSE than this on
# real dysarthric audio, and induced the model to invent a fluent opening sentence that
# was never spoken. Length here reads as thoroughness and behaves as distraction. Do not
# grow it back without re-measuring.
TASK_FRAMING = """\
Transcribe this dysarthric speech. The speaker's language is intact; only their
articulation is impaired. Recover their exact words.

Transcribe verbatim. Keep repetitions, restarts and hesitations exactly as spoken -- do
not tidy them into fluent prose. If they say the same phrase twice, write it twice."""


AUDIO_PRIMACY = """\
The audio is the evidence. Any context below is a hint, not a constraint -- transcribe
what is actually said even if it does not fit.

If the audio is silent, unintelligible, or noise, say so and return low confidence. Never
invent a plausible sentence to fill a gap: it will be spoken aloud in this person's voice,
to a stranger, as though they had said it."""


OUTPUT_SPEC = """\
Return JSON: {"best": str, "confidence": float 0-1, "alternates": [str],
"uncertain_words": [str]}.

`best` is their exact words, not a paraphrase. `confidence` is your genuine probability
that `best` is word-for-word correct; be willing to go low. `alternates` are genuinely
different readings, empty if there are none."""


@dataclass
class CompiledPrompt:
    text: str
    level: ContextLevel
    # What actually made it in, for eval reporting and for debugging a bad recovery.
    sections: list[str] = field(default_factory=list)
    pair_count: int = 0
    turn_count: int = 0


class PromptCompiler:
    def __init__(
        self,
        max_pairs: int = 30,
        max_turns: int = 6,
        max_vocabulary: int = 40,
    ) -> None:
        self.max_pairs = max_pairs
        self.max_turns = max_turns
        self.max_vocabulary = max_vocabulary

    def compile(
        self,
        *,
        level: ContextLevel = ContextLevel.FULL,
        pairs: list[ConfirmedPair] | None = None,
        vocabulary: list[str] | None = None,
        thread: list[Turn] | None = None,
    ) -> CompiledPrompt:
        pairs = pairs or []
        vocabulary = vocabulary or []
        thread = thread or []

        parts: list[str] = [TASK_FRAMING, AUDIO_PRIMACY]
        sections: list[str] = ["task_framing", "audio_primacy"]
        used_pairs = 0
        used_turns = 0

        if level is not ContextLevel.NONE:
            if pairs:
                selected = self._select_pairs(pairs)
                used_pairs = len(selected)
                parts.append(self._render_pairs(selected))
                sections.append("confirmed_pairs")

            if vocabulary:
                parts.append(self._render_vocabulary(vocabulary))
                sections.append("vocabulary")

        if level is ContextLevel.FULL and thread:
            selected_turns = thread[-self.max_turns :]
            used_turns = len(selected_turns)
            parts.append(self._render_thread(selected_turns))
            sections.append("thread")

            last_other = self._last_other(selected_turns)
            if last_other:
                parts.append(self._render_immediate_prior(last_other))
                sections.append("immediate_prior")

        parts.append(OUTPUT_SPEC)
        sections.append("output_spec")

        return CompiledPrompt(
            text="\n\n---\n\n".join(parts),
            level=level,
            sections=sections,
            pair_count=used_pairs,
            turn_count=used_turns,
        )

    # -- section rendering ---------------------------------------------------

    def _select_pairs(self, pairs: list[ConfirmedPair]) -> list[ConfirmedPair]:
        """Most recent first, capped.

        Recency is the whole ranking. At demo scale a user has tens of pairs, not
        thousands, and a correction they made five minutes ago is more likely to be
        relevant than one from last week. If this ever needs to scale, rank by acoustic
        or lexical similarity to the current utterance instead.
        """
        return pairs[: self.max_pairs]

    def _render_pairs(self, pairs: list[ConfirmedPair]) -> str:
        lines = [
            "THIS SPEAKER'S CONFIRMED CORRECTIONS",
            "",
            "Times this speaker has told us what they actually meant, after we misheard "
            "them. These show how their speech tends to be misheard -- the same "
            "substitutions usually recur, because the motor pattern causing them is "
            "consistent.",
            "",
            "Use these to resolve sounds you are unsure of. Do NOT assume this utterance "
            "is one of these sentences.",
            "",
        ]
        for pair in pairs:
            lines.append(f'  heard "{pair.heard}"  ->  actually said "{pair.said}"')
        return "\n".join(lines)

    def _render_vocabulary(self, vocabulary: list[str]) -> str:
        words = ", ".join(vocabulary[: self.max_vocabulary])
        return (
            "THIS SPEAKER'S FREQUENT VOCABULARY\n\n"
            "Words this speaker uses often. Slight evidence for these words over "
            "acoustically similar alternatives -- nothing more. They may say something "
            "entirely outside this list, and frequently will.\n\n"
            f"  {words}"
        )

    def _render_thread(self, turns: list[Turn]) -> str:
        lines = [
            "CONVERSATION SO FAR",
            "",
            "What has been said in this conversation, most recent last. This tells you "
            "the setting and topic. It does not tell you what this utterance is.",
            "",
        ]
        for turn in turns:
            who = "SPEAKER" if turn.speaker is Speaker.USER else "OTHER PERSON"
            lines.append(f"  {who}: {turn.text}")
        return "\n".join(lines)

    def _render_immediate_prior(self, text: str) -> str:
        return (
            "WHAT THE OTHER PERSON JUST SAID\n\n"
            f'  "{text}"\n\n'
            "The audio you are given is most likely a response to this, which constrains "
            "the plausible answers somewhat -- a question about size invites an answer "
            "about size. But people ignore questions, change subject, and interrupt. If "
            "the audio does not answer this, do not make it answer this."
        )

    @staticmethod
    def _last_other(turns: list[Turn]) -> str | None:
        for turn in reversed(turns):
            if turn.speaker is Speaker.OTHER:
                return turn.text
        return None


_WORD = re.compile(r"[a-z']+")


def normalize(text: str) -> list[str]:
    """Shared tokenizer for comparing two recoveries. Used by the gate and the evals so
    they agree on what counts as the same sentence."""
    return _WORD.findall(text.casefold())


compiler = PromptCompiler()
