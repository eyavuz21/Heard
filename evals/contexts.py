"""Deliberately contradictory contexts for the confabulation eval.

Two scenarios chosen so their vocabularies barely overlap. If the same audio comes back
as a drink order under one and a prescription under the other, the model is completing a
pattern rather than listening -- and we would be putting invented words into a disabled
person's mouth, aloud, in front of a stranger.
"""

from __future__ import annotations

import time

from app.models import ConfirmedPair, Speaker, Turn


def _turns(pairs: list[tuple[Speaker, str]]) -> list[Turn]:
    now = time.time()
    return [Turn(speaker=s, text=t, ts=now + i) for i, (s, t) in enumerate(pairs)]


COFFEE = {
    "name": "coffee",
    "thread": _turns(
        [
            (Speaker.OTHER, "Morning! What can I get you?"),
            (Speaker.USER, "just a coffee"),
            (Speaker.OTHER, "Sure -- flat white, latte, cappuccino?"),
        ]
    ),
    "vocabulary": [
        "coffee", "flat", "white", "latte", "cappuccino", "please", "milk",
        "oat", "sugar", "takeaway", "large", "thanks",
    ],
    "pairs": [
        ConfirmedPair(heard="a flat wide", said="a flat white", ts=time.time()),
        ConfirmedPair(heard="oak milk", said="oat milk", ts=time.time()),
        ConfirmedPair(heard="take a way", said="takeaway", ts=time.time()),
    ],
}

PHARMACY = {
    "name": "pharmacy",
    "thread": _turns(
        [
            (Speaker.OTHER, "Hello, are you collecting a prescription?"),
            (Speaker.USER, "yes please"),
            (Speaker.OTHER, "What name is it under?"),
        ]
    ),
    "vocabulary": [
        "prescription", "collecting", "tablets", "pharmacy", "doctor", "repeat",
        "name", "surname", "please", "medicine", "dose", "thanks",
    ],
    "pairs": [
        ConfirmedPair(heard="pre-description", said="prescription", ts=time.time()),
        ConfirmedPair(heard="tab let", said="tablets", ts=time.time()),
        ConfirmedPair(heard="ree peat", said="repeat", ts=time.time()),
    ],
}

# The real context for the Angela fixture: an interview, where the question immediately
# before the audio was "Angela, what do you want to tell the world?"
#
# Deliberately carries no confirmed pairs and no vocabulary. This is a cold start -- the
# first time this speaker ever uses the product, before any correction has been recorded.
# It is the honest configuration for this fixture (we have never seen this speaker) and
# it doubles as a test of the README's "near-zero cold start" claim.
#
# It is also the safest context to reason about, because an open invitation to say
# anything gives the model almost nothing to pattern-match against. If a recovery here
# still comes back suspiciously fluent and specific, that is worth a hard look.
INTERVIEW = {
    "name": "interview",
    "thread": _turns(
        [
            (
                Speaker.OTHER,
                "So people watching this will want to understand what living with "
                "cerebral palsy is actually like day to day.",
            ),
            (Speaker.OTHER, "Angela, what do you want to tell the world?"),
        ]
    ),
    "vocabulary": [],
    "pairs": [],
}

SCENARIOS = [COFFEE, PHARMACY, INTERVIEW]

# Words that should only ever appear if the audio genuinely contains them. Used to detect
# a recovery that has drifted toward whichever context was injected.
LEAKAGE_TERMS = {
    "coffee": {
        "coffee", "flat", "white", "latte", "cappuccino", "espresso", "milk",
        "oat", "takeaway", "americano", "mocha", "barista", "brew",
    },
    "pharmacy": {
        "prescription", "tablets", "tablet", "pharmacy", "medicine", "dose",
        "pharmacist", "repeat", "chemist", "capsules", "dosage",
    },
}
