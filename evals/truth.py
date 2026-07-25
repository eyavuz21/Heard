"""Ground truth for the Angela fixture, and word error rate against it.

Supplied by the team from the source video. This is the only labelled audio we have, and
it converts the whole eval suite from "directional signals" into real numbers: WER becomes
computable, and so does whether the confidence score means anything.

Caveats to keep in mind before quoting any figure from this:
  - It is ONE clip and one speaker. A WER from it is an anecdote with a decimal point,
    not a benchmark. Say so if it goes on a slide.
  - The reference was transcribed by ear, so it is itself approximate -- disfluencies and
    exact word forms may differ from what was actually uttered.
  - Because it is our only label, tuning prompts against it will overfit to this speaker.
    Treat a big win here as a hypothesis to re-test, not a result.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

REFERENCE = """
When you feel sorry for me, you are wasting your time and you are wasting my time.
We don't have time for pity. We have too much work to do. My disability is more physical
and you can see it. But that doesn't mean I am less of a person.
A lot of people think I have an intellectual disability, which I have to tell you,
I have two degrees and I don't like to say that. Because it sounds like I am bragging.
I just say that to get you to think of me like a regular adult.
"""

# Contractions and number words get written inconsistently by both humans and models.
# Normalising them stops WER from punishing differences that would be inaudible to the
# stranger at the counter, who is the only judge that matters.
_EQUIVALENTS = {
    "dont": "do not",
    "doesnt": "does not",
    "cant": "can not",
    "cannot": "can not",
    "wont": "will not",
    "im": "i am",
    "youre": "you are",
    "thats": "that is",
    "its": "it is",
}


def tokenize(text: str) -> list[str]:
    text = text.casefold()
    text = re.sub(r"[^a-z0-9\s']", " ", text)
    text = text.replace("'", "")
    tokens: list[str] = []
    for token in text.split():
        tokens.extend(_EQUIVALENTS.get(token, token).split())
    return tokens


@dataclass
class WER:
    wer: float
    substitutions: int
    deletions: int
    insertions: int
    reference_words: int
    hypothesis_words: int

    def __str__(self) -> str:
        return (
            f"WER {self.wer:.1%}  "
            f"(S{self.substitutions} D{self.deletions} I{self.insertions} "
            f"/ {self.reference_words} ref words)"
        )


def word_error_rate(reference: str, hypothesis: str) -> WER:
    """Standard Levenshtein-based WER with the edit operations broken out.

    The breakdown matters here: deletions mean the model dropped speech it could not
    resolve, insertions mean it added words that were never said. For this product those
    are not equally bad -- an insertion is a word we would put in someone's mouth.
    """
    ref, hyp = tokenize(reference), tokenize(hypothesis)

    # d[i][j] = edit distance between ref[:i] and hyp[:j], with backpointers folded in
    # as counts so we can report S/D/I separately rather than just the total.
    rows, cols = len(ref) + 1, len(hyp) + 1
    dist = [[0] * cols for _ in range(rows)]
    ops = [[(0, 0, 0)] * cols for _ in range(rows)]  # (sub, del, ins)

    for i in range(1, rows):
        dist[i][0] = i
        ops[i][0] = (0, i, 0)
    for j in range(1, cols):
        dist[0][j] = j
        ops[0][j] = (0, 0, j)

    for i in range(1, rows):
        for j in range(1, cols):
            if ref[i - 1] == hyp[j - 1]:
                dist[i][j] = dist[i - 1][j - 1]
                ops[i][j] = ops[i - 1][j - 1]
                continue

            substitute = dist[i - 1][j - 1] + 1
            delete = dist[i - 1][j] + 1
            insert = dist[i][j - 1] + 1
            best = min(substitute, delete, insert)
            dist[i][j] = best

            if best == substitute:
                s, d, ins = ops[i - 1][j - 1]
                ops[i][j] = (s + 1, d, ins)
            elif best == delete:
                s, d, ins = ops[i - 1][j]
                ops[i][j] = (s, d + 1, ins)
            else:
                s, d, ins = ops[i][j - 1]
                ops[i][j] = (s, d, ins + 1)

    subs, dels, inss = ops[-1][-1]
    return WER(
        wer=dist[-1][-1] / len(ref) if ref else 0.0,
        substitutions=subs,
        deletions=dels,
        insertions=inss,
        reference_words=len(ref),
        hypothesis_words=len(hyp),
    )
