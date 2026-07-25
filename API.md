# Relay backend — API contract

Base URL in development: `http://localhost:8000`. Interactive docs at `/docs`.

`app/models.py` is the authority for every shape below. If this document and that file
disagree, the file wins.

## The one rule

`/relay` never speaks. It returns what we think was said. `/confirm` is what produces
audio. This separation is the product's safety guarantee, not an implementation detail —
nothing is ever spoken aloud in the user's name without them tapping to approve it.

---

## Session lifecycle

### `POST /session`

Starts following a conversation.

```json
→ {"user_id": "angela"}
← {"session_id": "7b574ba317d34efb84ae1ef7fffa6d17"}
```

The `user_id` is what the profile is keyed on. There are no accounts — any stable string
works, and reusing one across sessions is how the learning loop persists.

### `DELETE /session/{session_id}`

Ends the session and drops the conversation thread.

```json
← {"cleared": true}
```

`cleared: false` means the session had already gone. This call is the privacy boundary:
everything the other person said is discarded here and nothing about them survives it.

---

## During the conversation

### `POST /session/{session_id}/ambient`

The other person spoke. Transcribe, append to the thread, use as context.

Body: `multipart/form-data`, field `audio`. Send ~5s chunks as they're captured.

```json
← {"text": "Sure -- flat white, latte, cappuccino?", "appended": true}
```

`appended: false` with empty text means there was no intelligible speech in the chunk —
normal for room noise, and not an error. Just keep sending.

**Privacy:** their audio exists only inside this request. It is never written to disk,
never returned, and nothing derived from it reaches the user's profile. Their text lives
in memory until `DELETE /session`.

### `GET /session/{session_id}/thread`

The running conversation, for display. Saves the frontend accumulating it client-side.

```json
← {"session_id": "fd95...", "turns": [
     {"speaker": "other", "text": "Morning. What can I get you today?", "ts": 1785008197.78}
   ]}
```

Optional `?speaker=other` or `?speaker=user` to filter. Returns `404` once the session is
cleared — the other person's words do not survive it.

### `POST /session/{session_id}/relay`

The user took their turn. Recover what they meant.

Body: `multipart/form-data`, field `audio` — the audio held between their two taps.

```json
←  {
     "relay_id": "da963222f0ae40749c972ae5b9321ba6",
     "best": "a flat white please",
     "confidence": 0.86,
     "alternates": ["a flat white to go"],
     "uncertain_words": ["flat"],
     "words": [
       {"index": 0, "word": "a", "alternatives": [], "agreement": 1.0},
       {"index": 1, "word": "flat", "alternatives": ["black"], "agreement": 0.8}
     ],
     "needs_confirmation": false
   }
```

| Field | Meaning |
|---|---|
| `relay_id` | Pass to `/confirm`. Single use. |
| `best` | Best recovery. Empty string means the model declined to guess — show the type-it fallback, do not show an empty card. |
| `confidence` | 0–1. Inter-sample agreement only. The model's self-report is deliberately weighted 0.0. |
| `alternates` | 0–3 genuinely different readings, drawn from disagreeing samples. |
| `uncertain_words` | Words within `best` to highlight. Subset of `best`'s words. |
| `words` | Per-word readings from the sample vote, including real alternatives and agreement. |
| `needs_confirmation` | `true` → show the alternates. `false` → show `best` alone. Advisory only. |

**`needs_confirmation` is a presentation hint, not permission to auto-speak.** Confirm
before speaking in both branches.

Errors:
- `404` — unknown session.
- `503` — recognition unavailable (missing key, network, API down). This is an outage,
  distinct from a failed recovery. Show a system error, never "I couldn't understand you".

### `POST /relay/{relay_id}/confirm`

The user approved a wording. Record it, then speak it.

```json
→ {"chosen_text": "a flat white please",
   "source": "best",
   "voice_id": "JBFqnCBsd6RMkjVDRZzb"}
```

| Field | Notes |
|---|---|
| `chosen_text` | Exactly what to speak. |
| `source` | `"best"` \| `"alternate"` \| `"typed"` — which path the user took. |
| `voice_id` | Optional; from `/voices`. Omit for the default. |

Returns raw **`audio/mpeg`** bytes — play them directly. Headers carry `X-Relay-Id` and
`X-Spoken-Text`.

**This call is the learning loop.** Every confirm writes a (heard → said) pair to the
profile, including `source: "best"` — an accepted guess is positive evidence and costs
nothing to keep. Skipping this call means the product does not learn.

`404` means the `relay_id` is unknown or already used.

---

## Supporting

### `GET /voices`

The voice picker. Six stock ElevenLabs voices spanning age and gender, biased British.

```json
← [{"voice_id": "JBFqnCBsd6RMkjVDRZzb", "label": "George",
    "age": "middle-aged", "gender": "male", "accent": "British (London)"}]
```

No voice cloning. Cloning from dysarthric audio reproduces the slur, which defeats the
purpose — it is deliberately not built.

### `GET /profile/{user_id}`

What the system has learned. Built for the demo: watching `pair_count` rise mid-conversation
is the product's whole argument.

```json
← {"user_id": "angela", "pair_count": 3,
   "recent_pairs": [{"heard": "a flat wide please",
                     "said": "a flat white please", "ts": 1753...}],
   "vocabulary": ["coffee", "please", "white"]}
```

### `GET /health`

```json
← {"ok": true, "gemini_key_set": true,
   "elevenlabs_key_set": true, "model": "gemini-2.5-flash"}
```

Check this first. Both keys false explains most failures.

---

## Typical sequence

```
POST /session                        → session_id
POST /session/{id}/ambient           ← "What can I get you?"     (repeat as they speak)
POST /session/{id}/relay             → best, alternates, relay_id
POST /relay/{relay_id}/confirm       ← mp3 bytes, pair written
                                       (loop back to /ambient)
DELETE /session/{id}                 → thread discarded
```

## Audio formats

Browser `MediaRecorder` output (`audio/webm;codecs=opus`) is passed straight through to
Gemini. mp3 and wav also work. Set the multipart part's content type — it is forwarded as
the MIME type, and a wrong one is a quiet source of failure.
