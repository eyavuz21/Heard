# Integration analysis — backend ↔ `VoiceBridgeDesign/`

Written after reading every file on both sides. The headline: the two halves are
**conceptually well matched and mechanically unconnected**. The frontend is a design
prototype with zero network code; the backend has nine endpoints and zero callers.

```
backend endpoints:              9
frontend fetch() calls:         0
frontend getUserMedia calls:    0
frontend audio playback:        0
```

Everything below is ordered by what will break the demo soonest.

---

## 0. Verify this first, before anything else

**Audio container mismatch — potential demo-killer.**

`MediaRecorder` in Chrome produces `audio/webm;codecs=opus`. Safari produces `audio/mp4`.
The backend passes `audio.content_type` straight through to Gemini as the MIME type:

```python
# app/main.py:97, 126
text = await recogniser.transcribe_ambient(data, audio.content_type or "audio/webm")
mime = audio.content_type or "audio/webm"
```

Gemini's documented audio input formats are WAV, MP3, AIFF, AAC, OGG Vorbis and FLAC.
**WebM is not on that list.** Every backend test to date has used mp3 fixtures, so this
path has never been exercised.

This is a fifteen-minute test and a multi-hour problem if left until the demo. Record one
second of webm from the browser, `curl` it at `/session/{id}/relay`, see what comes back.

If it fails, the fix is server-side transcode (`pydub`/`ffmpeg`, already a dependency) in
`recogniser.py` — normalise everything to mp3 or wav before the Gemini call, and stop
trusting the client's `content_type`.

---

## 1. The product's core action is missing from the UI

`POST /relay/{relay_id}/confirm` returns **`audio/mpeg` bytes**. That is the product:
the phone speaks aloud, in a chosen voice, to the person at the counter.

The frontend's confirm handler does this:

```tsx
// app/(app)/live/page.tsx:96
function confirmCorrect() {
  setConfirmedMessages((prev) => [...prev, words.join(" ")]);
  ...
}
```

It appends a text bubble. **Nothing in the entire frontend plays audio** — no `new Audio`,
no `<audio>` element, no blob URL. The one thing the app exists to do is not built.

Needed: take the response `Blob`, `URL.createObjectURL`, play it, revoke. Plus a visible
"speaking now" state, because the user needs to know the phone is talking for them.

---

## 2. No recording. At all.

`RecordingView`'s stop button is `onClick={() => setState("processing")}`. There is no
`getUserMedia`, no `MediaRecorder`, no blob anywhere in the codebase.

Both `live` and `share` need real capture. Backend expects **multipart/form-data, field
name `audio`** on both `/ambient` and `/relay`.

---

## 3. No session lifecycle, and no `user_id`

The backend is session-scoped — `session_id` is in the path of four endpoints, and
`/relay` 404s without a valid one. The frontend has no concept of a session and no
`user_id` anywhere in the codebase, which also means `/profile/{user_id}` cannot be called.

The hooks already exist and are well placed:

| Frontend function | Should call |
|---|---|
| `startConversation()` (live/page.tsx:79) | `POST /session` → store `session_id` |
| `endConversation()` (live/page.tsx:87) | `DELETE /session/{id}` |

`user_id` can be a `localStorage` UUID minted on first load. It needs to persist across
sessions — it is the key the learning loop is stored under.

**The Share page has no session either**, but `/relay` requires one. Share must create an
ephemeral session (and delete it after) or the backend needs a session-less relay variant.
Creating one is less work.

---

## 4. The ambient path is a hardcoded animation

`ListeningView` types out `partnerTranscriptLines` — three fixed strings from
`lib/mock-data.ts` — character by character on a 38ms timer.

The typewriter effect is a genuinely good design asset and should survive. But it needs a
real source:

- a chunked recorder posting ~5s clips to `POST /session/{id}/ambient`
- a poll of `GET /session/{id}/thread?speaker=other` to render turns
- the typewriter animating **newly arrived** text rather than a fixed array

Note `/ambient` returns `{text, appended}` directly, so polling `/thread` is optional for
the live view — but `/thread` is what survives a page refresh.

---

## 5. Word-level correction: the shapes genuinely don't match

This is the most interesting mismatch, and the one where **the backend should change, not
the frontend.**

**What the frontend does.** `wordsFromTranscript()` splits the transcript into tappable
chips. Tapping one opens `WordFixView` with three alternatives, looked up from
`wordAlternatives` — a hardcoded dictionary of ~30 English words in `mock-data.ts`. Tapping
an alternative swaps that one word.

**What the backend returns.**

```python
alternates: list[str]        # whole competing SENTENCES from disagreeing samples
uncertain_words: list[str]   # flat list of words, no positions
```

So the frontend's per-word picker has **no backend source at all**. `alternates` are whole
sentences; `uncertain_words` are bare strings with no index, so a repeated word can't be
located.

**Two ways out:**

**(a) Frontend adapts** — show `alternates` as three whole-sentence options. Zero backend
change, but it throws away the nicer interaction, and whole-sentence alternates are a worse
UX for someone with limited motor control.

**(b) Backend exposes per-word options — recommended.** `gate.consensus()` already computes
exactly this data and then discards it:

```python
# app/gate.py:227
for position, word in enumerate(backbone):
    votes = [word] + [a[position] for a in aligned]
    present = [v for v in votes if v is not None]
    counts = Counter(present)          # <-- every alternative reading, per position
    winner, support = counts.most_common(1)[0]
```

`counts` is the per-word alternatives list. Surfacing it is roughly fifteen lines:

```python
class WordOption(BaseModel):
    index: int
    word: str
    alternatives: list[str]   # other readings, most-supported first
    agreement: float          # 0-1, share of samples that voted for `word`
```

This is strictly better than the mock: the alternatives are real competing readings of that
person's actual audio, not a generic thesaurus. It also lets the UI **shade low-agreement
words** so the eye goes straight to the doubtful one — which is the confidence gate made
visible, and the strongest thing this product has to show.

Also change `uncertain_words: list[str]` → indices, for the same positional reason.

---

## 6. The confidence gate is invisible in the UI

The backend's entire safety argument — five samples voting, a no-context control catching
context-driven fabrication — produces two fields the frontend never reads:

```python
confidence: float
needs_confirmation: bool
```

`ConfirmView` renders identically whether confidence is 0.98 or 0.16. Two consequences:

**It's a missed pitch opportunity.** The differentiator is invisible. A low-confidence
state that says "I'm not sure — is it one of these?" *shows* the honesty claim instead of
asserting it.

**It's an active bug.** The backend deliberately returns `best: ""` when it refuses to
guess — silence, noise, or a majority of samples saying "I couldn't make that out"
(`gate.py:131`). The frontend will render **an empty word list above a "Correct" button.**
Tapping it sends `chosen_text: ""` to ElevenLabs and writes an empty confirmed pair.

`best === ""` needs its own screen: "I couldn't make that out — try again."

---

## 7. Timing: the design assumes 1.5s, reality is 12–25s

```tsx
// live/page.tsx:70 — ProcessingView duration
const t = setTimeout(() => { ... setState("confirm"); }, 1400);
```

A real relay is five Gemini Pro calls at HIGH thinking, bounded by a 25s per-sample timeout
(`config.py:52`). Measured median is around 12s.

`ProcessingView`'s copy — "Clarifying your words… / Taking a careful listen" — is honestly
rather good for a long wait. But it needs to *hold* for 25 seconds without feeling broken:
progressive copy, or an indeterminate progress treatment. A user staring at a static screen
for 20 seconds at a counter will tap again.

---

## 8. `My Words` ↔ `/profile` — right idea, three of four fields unsupported

| Frontend (`mock-data.ts`) | Backend (`ProfileResponse`) | Status |
|---|---|---|
| `stillLearning[].heard` / `.as` | `recent_pairs[].heard` / `.said` | ✅ maps directly |
| `stillLearning[].note` | — | editorial copy, no source. Hardcode or drop. |
| `wordGroups` (People / Places / Health / Everyday) | `vocabulary: list[str]` — flat | ❌ **no categories exist and none can be derived** |
| `understoodProgress.rate` (84%, ↑12%) | — | ❌ **backend cannot compute this** |

**Categories.** The backend derives `vocabulary` by word frequency over confirmed `said`
text. There is no semantic grouping and no cheap way to add one. Render a single flat
group, or drop the section.

**"Understood first time — 84%, ↑12% this week."** Nothing in the backend records
first-pass success. But it is *nearly* free to add and it is the honest version of exactly
this metric: `/confirm` already knows both `heard` and `chosen_text`, so
`count(heard == said) / count(*)` is the real first-pass rate. About ten lines in
`profile.py` plus a field on `ProfileResponse`.

Worth doing — but if it ships hardcoded at 84%, **do not present it as measured.** That is
the one number in this product that must not be invented, given the whole pitch is "it
never speaks a confident error."

---

## 9. `/voices` is built and unused

Six voices, age/gender/accent, British-biased. `ConfirmRequest.voice_id` is optional so
nothing breaks — but choosing the voice that will speak for you is a meaningful moment for
this product, and the backend work is already done. A picker on first run, or in My Words,
is a cheap demo win.

---

## 10. The Share page is ~70% fiction

| Share option | Backend reality |
|---|---|
| **Voice memo** — "Reconstructed voice recording" | ✅ **This is just `/confirm`'s mp3.** Pass the Blob to `navigator.share({files: [...]})` instead of `text`. Nearly free. |
| **Text** | ✅ works today, no backend needed |
| **Avatar video** | ❌ nothing exists, nothing planned. Toast it as coming soon like "Customise avatar" already does. |

`shareSuggestions` (five hardcoded phrases) could plausibly come from `/profile`
`recent_pairs` — the user's own frequent phrases, which is a much better story than five
generic ones.

---

## 11. Smaller things, still real

**Punctuation is destroyed before TTS.** `wordsFromTranscript()` strips all non-alphanumeric
characters, then `words.join(" ")` is what gets confirmed. The backend's `best` may contain
commas and full stops that shape ElevenLabs' prosody; they are gone by the time it is
spoken. Keep the original string alongside the chips and send that when unedited.

**`source` must be a valid literal or you get a 422.** Backend requires
`"best" | "alternate" | "typed"`. Map: untouched → `"best"`, word-fixed → `"alternate"`.
There is no typing UI anywhere (`WordFixView` says "no typing needed"), so `"typed"` is
unreachable — fine, but worth knowing the backend supports a fallback the design doesn't
offer. For someone whose speech isn't recovering at all, that fallback matters.

**`_pending` leaks.** `app/main.py:66` holds `relay_id → (user_id, heard)` forever. The
comment says it is "dropped on session clear"; it isn't — `DELETE /session` doesn't touch
it. Relays that are never confirmed accumulate. Also, `/confirm` **pops**, so a retried
confirm 404s. The frontend must not retry confirm, and the backend should clear `_pending`
on session delete.

**No frontend config.** No `NEXT_PUBLIC_API_BASE_URL`, no `.env.example`. Backend CORS is
already `allow_origins=["*"]` so nothing blocks it.

**`node_modules` is not installed** — the frontend has never been run in this checkout.
Worth confirming `npm install && npm run build` is clean before building on it.

**Naming.** Directory `VoiceBridgeDesign/`, `package.json` name `heard`, repo `voiceBridge`,
product "Heard". Cosmetic, but pick one before judges see the repo.

---

## Endpoint-by-endpoint status

| Endpoint | Frontend caller | Notes |
|---|---|---|
| `GET /health` | none | fine — useful for a connection indicator |
| `POST /session` | none | needed by `startConversation()` and by Share |
| `POST /session/{id}/ambient` | none | replaces the hardcoded typewriter |
| `POST /session/{id}/relay` | none | needs real `MediaRecorder` capture |
| `POST /relay/{id}/confirm` | none | **returns the audio nothing plays** |
| `GET /session/{id}/thread` | none | optional for live, needed for refresh-survival |
| `DELETE /session/{id}` | none | `endConversation()` |
| `GET /voices` | none | no picker exists |
| `GET /profile/{user_id}` | none | My Words is fully mocked; no `user_id` exists |

---

## Recommended order of work

**Must land or there is no demo:**

1. Verify webm → Gemini (§0). Transcode server-side if it fails.
2. `lib/api.ts` + `NEXT_PUBLIC_API_BASE_URL`; `user_id` in localStorage.
3. Session create/delete wired to start/end.
4. Real `MediaRecorder` capture on the live relay path.
5. **Play the mp3 from `/confirm`.**
6. Handle `best === ""` and 503 — the refusal states.
7. Stretch `ProcessingView` to tolerate 25 seconds.

**Makes the pitch land:**

8. Per-word alternatives from `gate.consensus()` (§5) — keeps the good UX, real data.
9. Surface `confidence` / `needs_confirmation` as a distinct low-confidence screen (§6).
10. Ambient chunked recording replacing the mock typewriter.
11. Wire My Words to `/profile`; flat vocabulary; real first-pass rate or drop the number.

**Cheap wins if time allows:**

12. Voice picker from `/voices`.
13. Share → voice memo using `/confirm`'s Blob.
14. Suggestions from the user's own `recent_pairs`.

**Cut:** avatar video, word categories.

---

## What is *not* wrong

Worth saying plainly, because the list above is long: the frontend's conceptual model is
correct. It confirms before speaking. It never auto-speaks. It offers alternatives rather
than demanding typing. It frames the learning loop as *"Heard is getting better at
understanding you — not the other way around"*, which is exactly the argument the backend
was built to support.

The two halves were designed against the same brief and they agree about the product. What
is missing is wiring, plus one honest shape mismatch on word alternatives where the backend
already has the data.
