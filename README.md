# Heard

*(repo: `voiceBridge`)*

**A one-tap speech relay for dysarthria that learns your voice as you use it.**

> They make you train a model, or hand you a new voice.
> Heard lets you speak *now* and be understood — one tap at a time.

🥈 **2nd place winner** at the [Consumer Health Hackathon](https://luma.com/londonai-m2w1) — London AI × Encode Club, backed by Juno (YC) & Anthropic. Encode Hub, London, July 2026.

**🚀 Try it live:** [heard-iota.vercel.app/live](https://heard-iota.vercel.app/live)
**🎬 Demo video:** [youtu.be/GoWUyqR2fKM](https://youtu.be/GoWUyqR2fKM)

![Four screens of Heard: starting a conversation; the other person's turn transcribed as "What would you like to drink today?"; recording the user's reply; and the confirm screen showing "i would like a cappuccino with cinnamon" at 96% confidence, with each word tappable to fix and Correct / Wrong buttons.](docs/demo.jpeg)

*The whole loop: listen → Speak → recover → confirm → speak aloud. Nothing is spoken until the user taps Correct.*

---

## The problem

People with dysarthria know exactly what they want to say. They build the sentence correctly. Their muscles won't execute it.

Their friends and family understand them fine — familiar listeners adapt. The barista doesn't. Neither does the GP receptionist, the taxi driver, or the person on the phone. Every one of those is a small failure, several times a day.

The problem isn't communication in general. **It's being understood by a stranger, once.**

**Who it's for:** dysarthria from Parkinson's, cerebral palsy, MS, ALS/MND, stroke or TBI. Primary target is **Parkinson's** — the dysarthria is characteristic and consistent, so there's real structure for the system to learn.

---

## What it does

Heard **listens to the conversation in the background**. When the user takes their turn, one big **Speak** button isolates their speech. Heard recovers what they meant, shows its best guess, and — on a single confirm — **speaks it aloud in a clean voice** — a matched voice by default (age, gender, accent), or the user's own cloned voice where a pre-onset recording exists. (Cloning from dysarthric audio reproduces the slur, so Heard is designed never to clone from impaired speech.)

- When it's **confident**, it shows a single guess to confirm.
- When it's **not sure**, it doesn't guess — it offers alternate readings, tappable per-word fixes, plus a "type it" fallback.
- Every confirm is **written to the user's profile** as a `(heard → said)` pair, and the profile is what conditions later recognition. The friction disappears with use.

Nothing is ever spoken without a confirm tap. `/relay` returns what we think was said; `/confirm` is the only thing that produces audio. That split is the safety guarantee, not an implementation detail.

---

## Use cases

### 1. Be understood in the moment *(core)*
The stranger interaction — the shop counter, the GP desk, the taxi, the phone call.

> **The demo in one line:** two failed attempts at a counter. One tap. Coffee handed over.

### 2. Share personalised messages *(shipped)*
Once Heard has recovered what you meant, being understood doesn't have to stop at the person in front of you. The Share tab hands the message to the OS share sheet, so it lands in WhatsApp / Messages / Instagram like anything else:

- 🎙️ **Voice** — your message as an mp3 in your own (cloned or matched) voice
- 💬 **Text** — as a plain written message
- 🧑 **Avatar** — an avatar clip carrying your message *(currently a pre-rendered demo asset, not generated per message — see [Status](#status))*
- 🎬 **Video** — a generated talking-head clip. **Not built.**

> **Consent & likeness:** voice cloning and avatar use the *user's own* voice and face, with their consent, as an assistive aid — their communication, on their channels. Not impersonation of anyone else.

---

## How it works

The user's speech never goes to a conventional ASR model. It goes to an **audio-native LLM, sampled several times in parallel**, and the disagreement between those samples is the confidence signal.

```
Other speaker's mic ──► ElevenLabs Scribe v2 realtime, IN THE BROWSER
                              │  server receives final text only, never their audio
                              ▼
                        conversation thread (in memory, per session)
                              │
User holds Speak ──► one complete recording ──► POST /session/{id}/relay
        │                                                  │
        ▼                                                  ▼
  ffmpeg → mp3                              prompt_compiler assembles, in this order:
  (Chrome emits webm/opus,                    1. audio-primacy framing FIRST
   Safari emits mp4)                          2. user's confirmed (heard → said) pairs
        │                                     3. their personal vocabulary
        │                                     4. recent ambient turns
        ▼                                                  │
   Gemini, audio-native (gemini-pro-latest)                │
   4 samples WITH context  +  1 control with NO context — all in parallel
        │
        ▼
   gate.fuse
     • word-by-word vote across samples  ──► best reading + per-word alternatives
     • grounding check vs the control     ──► did the audio write this, or the context?
     • honest-refusal override            ──► "couldn't make it out" beats a confident majority
        │
        ├── confidence ≥ 0.75 ──► single guess
        └── below            ──► alternates + word chips + type-it fallback
                              │
                 user taps confirm ──► POST /relay/{id}/confirm
                              │
                              ├─► write (heard → said) pair to the profile (SQLite)
                              └─► ElevenLabs TTS in the matched or cloned voice ──► spoken aloud
```

**Three design decisions carry the system:**

1. **Consensus over self-report.** The model's own `confidence` field measured as worthless on real dysarthric audio — 0.98 on a recovery that was 93% wrong. So it's read, stored, and weighted at **zero**. Confidence is per-word agreement across independent samples. Fed pure silence under a rich context, a single sample invented *"Don't give up."* at 0.95; five samples invented five different sentences, and the disagreement caught it.
2. **A no-context control sample.** Samples sharing a context can agree enthusiastically about the same fabrication. One sample runs with the context stripped out; if the answers diverge, the conversation wrote the answer rather than the audio, and confidence is scaled down. Observed live: a clip about the speaker's disability came back as *"i think we'll have a flat white"* purely because the other person had said *"flat white or latte?"*. The control caught it.
3. **Audio primacy stated before any context appears.** The instruction to trust the audio over the hints comes first in the prompt, framing everything after it. A longer, more thorough version of that framing measured **worse** and induced the model to invent a fluent opening sentence that was never spoken.

The learning loop is the hero mechanic: a word it has to ask about once, it should just *speak* the next time. It's honest by construction — speaking a confident error aloud in someone's own voice is worse than a two-second tap.

**Privacy boundary.** The other speaker's audio never reaches the server: Scribe realtime runs client-side against a single-use token, and only committed text is posted. The profile schema has no column for their words even if a caller tried. `DELETE /session/{id}` drops the thread — nothing about them survives it.

---

## How we stand out

The dysarthria-tech landscape splits into two camps, and neither is aimed at our moment:

- **Personalised recognisers** (Voiceitt, Google Project Euphonia) make you train a model on hours of recordings before they're useful, then speak their single best guess.
- **Voice-banking tools** (Apple Personal Voice, ElevenLabs Impact Program, AAC apps) give a voice to people who've lost speech entirely — they solve *what comes out*, not *understanding what someone who still speaks meant*.

Heard is the only one aimed at the person who **still speaks but isn't understood by a stranger**:

1. **Zero cold start, zero enrolment.** Because recovery is an audio-native LLM asked a well-framed question — not a speaker-specific acoustic model — it works on the first utterance with an empty profile. The user's own confirmed pairs then condition it from use one, with nothing to train.
2. **Honest by design** — never speaks without a confirm; when unsure, it asks; when it can't hear, it says so instead of filling the gap. Trust is the product.
3. **Learns per-word, visibly** — every confirm is a training pair, surfaced in **My Words** as an understood-first-time rate. Personal vocabulary beats any generic model and compounds with use.
4. **Built for the interaction, not the user** — designed around the thirty seconds with a stranger, not the user's whole daily life.

And it's **complementary, not competitive**, with the voice players: if you've banked or cloned your voice, Heard speaks your recovered sentence *in it*.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, Tailwind 4 — `VoiceBridgeDesign/`, on Vercel |
| API | FastAPI on Python 3.12 — `app/`, deployed as a Vercel function (`vercel.json`) |
| Speech recovery | Google Gemini audio-native via `google-genai`, model alias `gemini-pro-latest` |
| Confidence | Multi-sample consensus + a no-context control sample (`app/gate.py`) — no external model |
| Ambient ASR (other speaker) | ElevenLabs Scribe v2 realtime, **in-browser** via a single-use server-minted token |
| Speech out | ElevenLabs TTS (`eleven_turbo_v2_5`) + Instant Voice Cloning |
| Audio normalisation | ffmpeg (bundled via `imageio-ffmpeg`) — everything → mp3 before it hits Gemini |
| Profile store | SQLite, one file, no ORM (`data/profiles.db`; `/tmp` on Vercel) |

**Why `gemini-pro-latest` and not Flash.** Measured on real dysarthric audio, Pro roughly halved the error rate — and the difference landed on the words that carry meaning. Flash rendered *"think of me like a regular adult"* as *"a retard"*, *"an idiot"*, *"an ignorant adult"*. Pro recovered it. That's not a scoring difference, it's a different product. The model is a **forward-tracking alias, not a pinned version**: a pinned `gemini-2.5-flash` had already been retired for new users and failed at runtime rather than at review. Re-measure with `uv run python evals/compare_models.py` before changing it.

**No accounts.** `user_id` is any stable string from the browser; reusing it across sessions is how the learning loop persists. Keys are server-side only — the browser never sees the Gemini or ElevenLabs API key, only a scoped single-use Scribe token.

---

## Run it locally

Backend (needs [uv](https://docs.astral.sh/uv/)):

```bash
cp .env.example .env          # add GEMINI_API_KEY and ELEVENLABS_API_KEY
uv run uvicorn app.main:app --reload --port 8000
```

Interactive docs at `http://localhost:8000/docs`; `GET /health` reports which keys are set.
`RELAY_TRACE=1` prints every Gemini request and response to the console (console only, deliberately — prompts embed the other speaker's words).

Frontend:

```bash
cd VoiceBridgeDesign
npm install
npm run dev                   # http://localhost:3000
```

Point it at the backend with `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:8000`).

Tests:

```bash
uv run pytest                 # 32 offline tests, no API calls, no spend
uv run pytest -m live         # the evals — real, paid calls, opt in deliberately
```

---

## Status

Hackathon build, core loop working end to end and deployed: **listen → Speak → recover → confirm → speak aloud**, plus Share.

Known gaps, stated plainly:

- **The Live path runs recognition without the profile.** `/relay` is called with `use_profile=false` from Live, so recognition there uses only the current session's ambient thread. Confirms still write pairs, **My Words** still shows them accumulating, and Share does use full profile context — but the compounding personalisation isn't yet switched on where it matters most. This is the next thing to land.
- **The avatar clip is a pre-rendered asset** (`public/avatar-preview.mp4`), not generated from the user's photos per message. Generated talking-head video isn't built.
- **Profiles don't survive redeploys on Vercel**, since the function filesystem is ephemeral and SQLite lives in `/tmp`. Fine for a demo, wrong for real use.
- **CORS is wide open** and there is no auth. Deliberate for the hackathon; must be tightened before this is public.
- **Pre-onset-only cloning is a stated policy, not a code-enforced one.** Nothing currently stops a user uploading impaired audio to the clone endpoint.

## Safety

Heard is an **assistive communication aid, not a medical device** — no diagnosis, no clinical claims. Voice and likeness features use the user's own voice and face with consent.

The eval fixture is a real speech sample from a named third party with cerebral palsy, with **no ground-truth transcript and unconfirmed provenance**. WER and calibration figures cannot be computed from it and must never be quoted or implied. See `evals/README.md` before touching it.

## Team

- **Emre Yavuz** — [LinkedIn](https://www.linkedin.com/in/dr-emre-yavuz-449216187/)
- **Sevara Bakhodirova** — [LinkedIn](https://www.linkedin.com/in/sevara-bakhodirova-485102205/)
- **Rashad Hosseini** — [LinkedIn](https://www.linkedin.com/in/rashad-hosseini/)
- **Maria Papageorgiou** — [LinkedIn](https://www.linkedin.com/in/mariapapz)
