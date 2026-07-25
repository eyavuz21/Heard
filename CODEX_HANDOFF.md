# Handoff brief — "Heard" (repo `voiceBridge`)

You are picking up a 24-hour hackathon project mid-build. The backend is complete and
measured. The frontend is a design-only prototype with **zero** network code. Your job is
to finish three small backend changes and then wire the two halves together.

Read this whole document before writing code. It contains measured findings that look like
arbitrary choices but are not — several of them will look "wrong" and tempt you to
"improve" them. Section 4 lists the ones that must not be reverted.

---

## 1. The product

**Heard** is a one-tap speech relay for people with **dysarthria** — a motor speech
disorder where articulation is impaired but **language is fully intact**. These are adults
who know exactly what they want to say and are not understood by strangers: a barista, a GP
receptionist, a taxi driver.

The loop:

1. The app listens to the *other* person in the conversation (ambient), building context.
2. The user taps and speaks.
3. The backend recovers what they meant using **audio-native Gemini** — not conventional
   ASR — with the conversation and the user's confirmed-correction history as context.
4. The app shows the best guess.
5. **The user confirms.**
6. The app speaks it aloud through ElevenLabs TTS.
7. The confirmation is written to the user's profile so the same utterance resolves
   first-pass next time.

### The one rule, which overrides everything

> **It must never speak a confident error.**

Putting invented words in a disabled person's mouth, aloud, to a stranger, is worse than
any transcription failure. Every design decision defers to this. Concretely:

- **Nothing is ever spoken without an explicit user confirmation.** There is no auto-speak
  path and you must not add one, not even behind a "high confidence" threshold.
- When the model cannot make out the audio, the correct output is **nothing**, not a
  plausible guess.
- Confidence gates *presentation*, never *safety*. A miscalibrated score costs the user a
  wasted tap, never a spoken error.

---

## 2. Repository layout

```
voiceBridge/
├── app/                      Python backend — FastAPI. COMPLETE (3 small changes left).
│   ├── main.py               Routes only. All behaviour lives in the modules it calls.
│   ├── config.py             Every tunable. Read the comments before changing anything.
│   ├── models.py             THE API CONTRACT. Single source of truth. No FastAPI import.
│   ├── prompt_compiler.py    Assembles the Gemini prompt. Pure, no network.
│   ├── recogniser.py         Gemini calls + audio normalisation.
│   ├── gate.py               Sample fusion, word-level consensus, confidence.
│   ├── session.py            In-memory session + conversation thread.
│   ├── profile.py            SQLite store of confirmed corrections.
│   └── tts.py                ElevenLabs synthesis, 6 hardcoded voices.
├── tests/                    18 offline tests, no API key needed. MUST STAY GREEN.
├── evals/                    Throwaway tuning scaffolding. Nothing in app/ imports it.
│   └── fixtures/*.mp3        One real 60s dysarthric clip + generated segments.
├── VoiceBridgeDesign/        Next.js 15 / React 19 / Tailwind 4 frontend. DESIGN ONLY.
├── API.md                    Frontend-facing contract doc. One line is stale — see §5.
├── INTEGRATION.md            Detailed gap analysis. Read it; it is accurate.
└── CODEX_HANDOFF.md          This file.
```

Backend runs on **Python 3.12** (pinned in `.python-version` — 3.13 removed `audioop`,
which `pydub` needs). Package manager is **uv**. ffmpeg must be on PATH.

```bash
uv run uvicorn app.main:app --reload --port 8000   # backend
cd VoiceBridgeDesign && npm install && npm run dev  # frontend (node_modules NOT installed)
uv run pytest                                       # 18 offline tests, no API calls
```

---

## 3. Backend architecture

### Recognition is not ASR

We do not run a speech recognition model. We hand **raw audio bytes plus an assembled
context prompt** to Gemini and ask it a well-framed question. `recogniser.py` is
deliberately thin; the intelligence is in what `prompt_compiler.py` assembles and what
`gate.py` does with the results.

### The confidence gate — how fabrication is caught

A single Gemini sample will confidently invent a sentence when the audio is unclear. Three
mechanisms catch this, all in `gate.py`:

**(a) Sample disagreement.** Every relay fires **5 samples in parallel** at temperature 1.0.
Independent hallucinations do not agree on specifics, so inter-sample disagreement is the
confidence signal.

**(b) Word-level consensus (ROVER-style).** `consensus()` picks a "backbone" sample (the one
closest to all others), aligns the rest to it with `SequenceMatcher` opcodes, and
majority-votes per word position. Words that fewer than half the samples heard are
**dropped rather than spoken**. Different samples get different spans right; voting
assembles the best-supported reading from all of them.

**(c) The no-context control.** One of the five samples runs with **no context at all**.
Samples that share a context can all be pulled toward the same plausible invention and
agree enthusiastically about it. If the contextual answer and the control answer diverge
badly (below `GROUNDING_FLOOR = 0.6` similarity), confidence is scaled down by the overlap.

### Privacy — non-negotiable, and asserted by tests

- The other speaker's audio is **never written anywhere**. It exists only inside the
  `/ambient` request handler and is explicitly deleted.
- Their text is **session-scoped only** and vanishes on `DELETE /session`.
- **Nothing derived from them ever reaches the user's profile.** `tests/test_privacy.py`
  asserts structurally that the SQLite schema has no column for the other speaker and that
  `profile.py` never references `Speaker.OTHER`. Do not break these tests.
- `recogniser.py` has a `relay.calls` logger for verbatim request/response tracing. It is
  **console-only by design** — prompts embed the other speaker's words, so attaching a
  `FileHandler` writes a third party's speech to disk. Don't.

---

## 4. Measured findings — DO NOT REVERT THESE

Every item here was established by running real audio through the system. They will look
like arbitrary or suboptimal choices. They are not.

| Choice | Why it is that way |
|---|---|
| `gemini_model = "gemini-pro-latest"` | Pro roughly **halved** Flash's error rate on the real dysarthric clip, and the difference landed on meaning-bearing words. Flash rendered *"think of me like a regular adult"* as *"a retard"*, *"an idiot"*, *"an ignorant adult"* — in every variant. Pro recovered it correctly. This is not a scoring difference, it is a different product. |
| Model name is an **alias**, not a pinned version | `gemini-2.5-flash` was hardcoded and had already been retired for new users — it failed at runtime, not review. Aliases track forward. |
| `SELF_REPORT_WEIGHT = 0.0` | The model's own `confidence` field carries **no information**. Measured: 0.98 on a 17%-wrong recovery, 0.98 on a 93%-wrong one, and 0.94 on the run that produced a slur. Blending a signal that does not discriminate only adds variance. `tests/test_gate.py` pins this. |
| `gate_samples = 5` | Load-bearing, not a tuning knob. Fed **pure silence** under a rich context, a single sample returned *"Don't give up."* at 0.95 confidence. Three samples returned three *different* inventions and the disagreement caught it. Five because the samples also vote word-by-word, and more voters sharpen the vote. |
| `sample_timeout_seconds = 25.0` | Median latency is ~10s but the tail runs to minutes, and `asyncio.gather` waits for the slowest. Generous, so nearly every sample reaches the vote — and the vote is what catches fabrication. |
| `thinking_level = "HIGH"` | Measured as nearly free: ~0.1s on Flash, ~0.8s on Pro. |
| The prompt is **short** (~900 chars, was ~3,600) | The long version scored **worse** AND induced fabrication. Do not "enrich" the prompt. |
| Single-sample confidence is capped below threshold | `mean_pairwise_agreement` returns 1.0 for one sample — certainty manufactured from nothing. This is what let a fabricated sentence pass at 0.95. |
| No voice cloning | Cloning from dysarthric audio reproduces the slur. Out of scope permanently. |

**Confabulation is real and was demonstrated live.** A 3-second clip of the speaker
discussing her disability, given barista context *"flat white or latte?"*, returned
***"i think we'll have a flat white"*** with all-coffee alternates. Without context, the
same audio gave *"my god we have had a hard time"*. The control sample caught it:
confidence dropped 0.486 → 0.165.

**Known limitation, do not be surprised by it:** the opening line of the test clip
(*"When you feel sorry for me, you are wasting your time"*) has never been recovered
correctly by any configuration.

---

## 5. The API contract

`app/models.py` is authoritative. `API.md` is the frontend-facing prose version.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ok, gemini_key_set, elevenlabs_key_set, model}` |
| POST | `/session` | `{user_id}` | `{session_id}` |
| POST | `/session/{sid}/ambient` | multipart, field `audio` | `{text, appended}` |
| POST | `/session/{sid}/relay` | multipart, field `audio` | `RelayResult` |
| POST | `/relay/{rid}/confirm` | `{chosen_text, source, voice_id?}` | **`audio/mpeg` bytes** |
| GET | `/session/{sid}/thread?speaker=` | — | `{session_id, turns[]}` |
| DELETE | `/session/{sid}` | — | `{cleared}` |
| GET | `/voices` | — | `[{voice_id, label, age, gender, accent}]` |
| GET | `/profile/{user_id}` | — | `{user_id, pair_count, recent_pairs[], vocabulary[]}` |

```python
class RelayResult(BaseModel):
    relay_id: str
    best: str                      # "" means WE REFUSED TO GUESS — see §7.5
    confidence: float              # 0..1
    alternates: list[str]          # <=3 whole competing SENTENCES
    uncertain_words: list[str]     # flat strings, NO positional index
    needs_confirmation: bool       # advisory: show options vs a single guess

class ConfirmRequest(BaseModel):
    chosen_text: str
    source: Literal["best", "alternate", "typed"]   # REQUIRED, 422 if invalid
    voice_id: str | None = None
```

- CORS is already `allow_origins=["*"]`.
- `RecognitionUnavailable` (no API key, network down, all samples failed) → **HTTP 503**.
  This is deliberately distinct from "could not make out the audio": a config failure must
  never masquerade as a recognition failure.
- Unknown session or unknown `relay_id` → **404**.

**`API.md` line 96 is STALE and must be corrected** (task 6.4). It claims confidence
"fuses inter-sample agreement (weighted 0.65) with the model's self-report (0.35)". The
actual weights are `1.0` / `0.0`.

---

## 6. Backend work remaining

### 6.1 ✅ ALREADY DONE — audio normalisation (do not redo)

`recogniser.py` now has `normalise(audio, mime_type) -> (bytes, mime)`, called at the top of
`recognise_samples`, `recognise_with_control`, and `transcribe_ambient`. It decodes any
browser format via pydub/ffmpeg and re-encodes to mp3; mp3/wav pass through untouched;
decode failure falls back to the original bytes with a warning.

Verified working: `audio/webm;codecs=opus` (Chrome), `audio/mp4`, `audio/mp4;codecs=mp4a.40.2`,
`audio/aac` (Safari) all → `audio/mpeg`. 18 tests still pass.

**Why it exists:** Gemini's documented audio formats do not obviously include WebM or MP4
containers, and every eval was measured on mp3. Now the model sees in production exactly
the format it was tuned against, and the browser no longer matters.

### 6.2 Expose per-word alternatives — MAJOR, do this first

The frontend has a per-word correction UI (tap a word → pick an alternative) backed by a
**hardcoded ~30-word thesaurus** in `lib/mock-data.ts`. The backend returns whole competing
sentences, so the UI has no real data source.

**`consensus()` in `gate.py:190-246` already computes exactly this data and throws it away:**

```python
for position, word in enumerate(backbone):
    votes = [word] + [a[position] for a in aligned]
    present = [v for v in votes if v is not None]
    counts = Counter(present)          # <-- every reading at this position
    winner, support = counts.most_common(1)[0]
    share = support / len(votes)
```

`counts` is the per-word alternatives list. Only `winner` survives.

**Add to `models.py`:**

```python
class WordOption(BaseModel):
    """One word position in `best`, with the other readings the samples produced.

    These are real competing readings of this person's actual audio, not generic
    synonyms — which is what makes the correction UI worth tapping.
    """
    index: int                     # position in best.split()
    word: str                      # the winning reading
    alternatives: list[str]        # other readings, most-supported first
    agreement: float               # 0..1, share of samples that voted for `word`
```

Add `words: list[WordOption] = Field(default_factory=list)` to `RelayResult`. Populate it
in `consensus()` (change its return signature) and thread it through `fuse()`.

Keep `alternates` and `uncertain_words` as they are — do not break the existing tests.

This also lets the UI **shade low-agreement words**, which makes the confidence mechanism
visible. That is the single strongest demo moment available and it is currently invisible.

### 6.3 Guard empty confirms — MAJOR

`profile.py:67` `add_pair` stores unconditionally (deliberately — an accepted guess is
positive signal). But when the gate refuses (`best == ""`) and the UI lets the user confirm
anyway, this writes `ConfirmedPair(heard="", said="")` permanently and sends an empty string
to ElevenLabs.

Reject empty/whitespace `chosen_text` at `POST /relay/{rid}/confirm` with a 400.

### 6.4 Two small fixes — MINOR

- **`main.py:180-184`** — `clear_session()` never clears `_pending`, contradicting its own
  comment at lines 63-66 ("dropped on session clear"). Unconfirmed relays leak for the
  process lifetime. Either key `_pending` by session, or sweep matching entries on delete.
- **`API.md:96`** — correct the stale confidence formula (see §5).

### 6.5 Known behaviour to preserve, not fix

`/confirm` **pops** from `_pending`, so a retried confirm 404s. That is fine — the frontend
must simply not retry. Do not add retry tolerance that would let a double-tap write two
confirmed pairs.

---

## 7. Frontend work — this is the bulk of it

`VoiceBridgeDesign/` is a **design-only prototype**. Verified by exhaustive grep — zero
matches, across every `.ts`/`.tsx` file, for: `fetch`, `XMLHttpRequest`, `axios`,
`getUserMedia`, `MediaRecorder`, `new Audio`, `<audio`, `createObjectURL`, `process.env`,
`NEXT_PUBLIC`, `session_id`, `user_id`, `relay_id`, `voice_id`, `confidence`,
`needs_confirmation`. `package.json` has three dependencies: next, react, react-dom.

Every screen is driven by `setTimeout` and `lib/mock-data.ts`.

**The design itself is good and its conceptual model is correct** — it confirms before
speaking, never auto-speaks, and offers tappable alternatives rather than demanding typing
from someone with limited motor control. Preserve the visual design and the interaction
model. You are adding wiring, not redesigning.

### Files

```
app/page.tsx                     landing (marketing, no backend needed — leave alone)
app/(app)/layout.tsx             PhoneShell wrapper
app/(app)/live/page.tsx      293L THE CORE LOOP — most of the work is here
app/(app)/share/page.tsx     285L record-once-then-send
app/(app)/my-words/page.tsx   99L profile screen — LEAVE MOCKED (see §8)
components/TranscriptConfirm.tsx  ConfirmView + WordFixView, shared by live and share
components/ui/SpeakBlob.tsx       the record button, has idle/speak/recording modes
lib/mock-data.ts                  all fake data — being replaced piecemeal
```

### 7.1 API layer — build this first

Create `lib/api.ts`: typed client for all 9 endpoints, base URL from
`NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`). Add `.env.example`.

Mirror the TypeScript types from `app/models.py` exactly. Handle 503 and 404 distinctly —
they mean different things to the user (see §7.5).

Mint a `user_id` (UUID) into `localStorage` on first load. **It must persist across
sessions** — it is the key the learning loop is stored under.

### 7.2 Recording

`useRecorder()` hook: `getUserMedia({audio: true})` + `MediaRecorder`, producing a `Blob`.
POST as `multipart/form-data` with field name **`audio`**.

Do not fight the browser over format — the backend normalises everything now (§6.1).

Currently `RecordingView.onStop` (`live/page.tsx:132`) just calls `setState("processing")`.

### 7.3 Playback — the product's core action is missing entirely

`POST /relay/{rid}/confirm` returns **`audio/mpeg` bytes**. That is the product: the phone
speaking aloud, in a chosen voice, to the person at the counter.

`confirmCorrect()` (`live/page.tsx:96`) currently just appends a text bubble. **Nothing in
the entire app plays audio.**

Take the response `Blob` → `URL.createObjectURL` → play → revoke. Add a visible "speaking
now" state; the user needs to know the phone is talking for them.

### 7.4 Session lifecycle

| Hook | Call |
|---|---|
| `startConversation()` `live/page.tsx:79` | `POST /session` → store `session_id` |
| `endConversation()` `live/page.tsx:87` | `DELETE /session/{id}` |

**The Share page has no session concept at all** but `/relay` requires one. Give it an
ephemeral session created on record and deleted after send.

### 7.5 Refusal and error states — currently a real bug

The backend deliberately returns `best: ""` when it refuses to guess (silence, noise, or a
majority of samples reporting unintelligible — `gate.py:116-125` and `131-140`).

`ConfirmView` renders whatever `words` array it is given with **no emptiness check**, so
this produces an **empty chip list above a live "Correct" button**. Tapping it sends
`chosen_text: ""`.

Required states:
- `best === ""` → "I couldn't make that out — try again." No confirm button.
- **503** → "Something's wrong on our end" — NOT "I couldn't understand you". The backend
  goes to real lengths to distinguish these; do not collapse them in the UI.
- **404 session** → session expired, restart.

### 7.6 Surface the confidence gate

No component reads `confidence` or `needs_confirmation`. `ConfirmView` looks identical at
0.98 and at 0.16.

Branch on `needs_confirmation`: false → show `best` alone; true → lead with alternatives
("I'm not sure — is it one of these?"). Confirm-before-speak still applies in **both**
branches. Once §6.2 lands, shade words by `agreement`.

### 7.7 Timing

`live/page.tsx:68-77` assumes a **1400ms** round trip. Reality is **12–25 seconds** (5
parallel Pro calls at HIGH thinking, 25s per-sample timeout).

Replace the fake timer with the real promise. `ProcessingView` must hold for ~25s without
looking broken — progressive copy or an indeterminate animation. Its existing copy
("Clarifying your words… / Taking a careful listen") is good; it just needs to sustain.

A user staring at a frozen screen for 20 seconds at a counter will tap again.

### 7.8 Ambient

`ListeningView` types out three hardcoded strings from `partnerTranscriptLines` on a 38ms
timer. **Keep the typewriter effect** — it is a good design asset — but drive it from real
data: chunked ~5s recordings POSTed to `/session/{id}/ambient`, animating newly arrived
text. `/ambient` returns the text directly; `GET /thread` is only needed for
refresh-survival.

### 7.9 Punctuation loss before TTS

`wordsFromTranscript()` (`lib/mock-data.ts:45-51`) strips all non-alphanumerics, and both
pages rebuild the string with `words.join(" ")`. Commas and full stops shape ElevenLabs
prosody and question intonation — they are gone by the time `chosen_text` is sent.

Keep the original `best` string alongside the chip array and send it unmodified when the
user has not edited anything.

### 7.10 `source` mapping

Untouched confirm → `"best"`. Word-fixed → `"alternate"`. `"typed"` is currently
unreachable (there is no typing UI anywhere). Send a valid literal or the request 422s.

---

## 8. Scope decisions already made by the project owner

**In scope:** Live (the core loop), Ambient capture, Share page.

**Out of scope:**
- **My Words** stays fully mocked. Do not wire it to `/profile`. The learning loop still
  works server-side — `/confirm` writes confirmed pairs regardless — it just is not
  displayed.
- The "Understood first time — 84%, ↑12% this week" stat on My Words is **hardcoded and
  must be visibly labelled as illustrative on screen**. The backend cannot compute it. This
  is the one number that must not look measured when it isn't, in a product whose entire
  pitch is that it never states a confident error. **Do not present it as real.**
- **Avatar video** on the Share page is fiction. Toast it as "coming soon", as
  "Customise avatar" already does.
- Voice picker (`GET /voices`) — built backend, no UI. Optional; nice if time allows.

**Other decisions:**
- **Latency:** keep 5 samples on Pro. Do not trade recognition quality for speed. Design
  the wait instead.
- **Demo target:** Mac Safari on localhost (a secure context, so `getUserMedia` works with
  no setup). Vercel deploy is wanted **later, not now** — so keep the API base URL in an
  env var and avoid anything that hardcodes localhost.
  *Note for whoever does that deploy: Vercel hosts the Next frontend fine, but the Python
  backend needs a separate host (Railway/Render/Fly).*
- **Share → voice memo** is nearly free: it is `/confirm`'s mp3 Blob handed to
  `navigator.share({files: [...]})` instead of the current text-only share.
- **Share → text** already works and needs no backend.

---

## 9. Working constraints

- **Do not run paid API calls without asking.** The project owner runs those himself and
  pays for them. `uv run pytest` is safe — live tests are marked and deselected by default
  via `addopts = "-m 'not live'"`. Build eval scripts and hand over the commands rather
  than executing them.
- **`tests/` must stay green.** 18 offline tests, no API key required. `test_gate.py` pins
  the honesty behaviours; `test_privacy.py` pins the privacy claim structurally.
- **`evals/` is throwaway scaffolding** for model/prompt tuning. Nothing in `app/` imports
  it. It contains a reference transcript used only for scoring. Do not wire it into
  production code.
- Do not add an auto-speak path.
- Do not attach a `FileHandler` to the `relay.calls` logger.
- Do not enrich the prompt — it was shortened deliberately and measured.

---

## 10. Suggested order

1. §6.2 per-word alternatives (backend, unblocks the best UI work)
2. §6.3 empty-confirm guard, §6.4 the two small fixes
3. §7.1 `lib/api.ts` + `user_id` + `.env.example`
4. §7.4 session lifecycle
5. §7.2 recording → real `/relay`
6. §7.3 **playback** — the product does not exist without this
7. §7.5 refusal and error states
8. §7.7 stretch the processing state to tolerate 25s
9. §7.6 surface confidence, shade words by agreement
10. §7.8 ambient chunked capture
11. §7.9 punctuation, §7.10 source mapping
12. Share page: ephemeral session, voice memo via Blob
13. My Words: add the "illustrative" label only

### Verification

- `uv run pytest` — 18 pass.
- Backend up, frontend up, end-to-end in Mac Safari: start conversation → speak → wait →
  confirm → **hear the phone speak**. This is the demo; rehearse it as a test.
- Feed silence and confirm the UI shows the refusal state rather than an invented sentence.
  This is the product's central claim and the most valuable thing to be able to show.
