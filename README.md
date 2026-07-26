# Heard

*(repo: `voiceBridge`)*

**A one-tap speech relay for dysarthria that learns your voice as you use it.**

> They make you train a model, or hand you a new voice.
> Heard lets you speak *now* and be understood — one tap at a time.

Built for the Juno × Anthropic consumer-health hackathon.

**🚀 Try it live:** [heard-iota.vercel.app/live](https://heard-iota.vercel.app/live)
**🎬 Demo video:** [watch here](https://docs.google.com/videos/d/1071aXKySeums10puedwNaPpqlU0AEusHCbOFS_RzK-0/play?usp=sharing)

---

## The problem

People with dysarthria know exactly what they want to say. They build the sentence correctly. Their muscles won't execute it.

Their friends and family understand them fine — familiar listeners adapt. The barista doesn't. Neither does the GP receptionist, the taxi driver, or the person on the phone. Every one of those is a small failure, several times a day.

The problem isn't communication in general. **It's being understood by a stranger, once.**

**Who it's for:** dysarthria from Parkinson's, cerebral palsy, MS, ALS/MND, stroke or TBI. Primary target is **Parkinson's** — the dysarthria is characteristic and consistent, so there's real structure for the system to learn.

---

## What it does

Heard **listens to the conversation in the background**. When the user takes their turn, one big **Speak** button isolates their speech. Heard recovers what they meant, shows its best guess, and — on a single confirm — **speaks it aloud in a clean voice** — a matched voice by default (age, gender, accent), or the user's own cloned voice where a pre-onset recording exists. (Cloning from dysarthric audio reproduces the slur, so Heard never clones from impaired speech.)

- When it's **confident**, it speaks straight away.
- When it's **not sure**, it doesn't guess — it offers a couple of tappable options, plus a "type it" fallback.
- Every correction is **written to the user's profile**, so the same word resolves first-pass next time. The friction disappears with use.

---

## Use cases

### 1. Be understood in the moment *(core)*
The stranger interaction — the shop counter, the GP desk, the taxi, the phone call.

> **The demo in one line:** two failed attempts at a counter. One tap. Coffee handed over.

### 2. Share personalised messages *(async)*
Once Heard has recovered what you meant, being understood doesn't have to stop at the person in front of you. Send the message however you like:

- 🎙️ **Voice** — your message as a recording in your own (cloned or matched) voice, straight to WhatsApp / Instagram / Messenger
- 💬 **Text** — as a plain written message
- 🧑 **Avatar** — a personalised avatar built from your uploaded photos, speaking your message
- 🎬 **Video** — a generated talking-head clip of you saying it

So the same "say it once, be understood" promise extends to every channel the user already lives in.

> **Consent & likeness:** voice cloning and avatar/video use the *user's own* voice and face, with their consent, as an assistive aid — their communication, on their channels. Not impersonation of anyone else.

---

## How it works

```
Background ASR (room / interviewer)  ──►  live conversation context
                                            │
User presses Speak ──► background pauses    │
        │                                   │
        ▼                                   ▼
  ElevenLabs Scribe v2  ──►  Retrieve few-shot examples  ──►  LLM correction
  (user audio only,          • user's own confirmed pairs     (Gemini 2.5 Flash,
   word confidence)            FIRST (the moat)                v010 repair rules
                             • TORGO seed pool by              + conversation context)
                               text similarity                        │
                             • demographics = tiny tie-breaker         ▼
                                                              confidence / plausibility gate
                                                                       │
                                              confident ──► speak    unsure ──► confirm cards
                                                                       │
                                                                       ▼
                                                        ElevenLabs TTS (clean / cloned voice)
                                                        + write confirmed pair back to profile
```

**The learning loop is the hero mechanic:** a word it has to ask about once, it just *speaks* the next time. That's the whole proof — and it's honest: speaking a confident error aloud in someone's own voice is worse than a two-second tap.

---

## How we stand out

The dysarthria-tech landscape splits into two camps, and neither is aimed at our moment:

- **Personalised recognisers** (Voiceitt, Google Project Euphonia) make you train a model on hours of recordings before they're useful, then speak their single best guess.
- **Voice-banking tools** (Apple Personal Voice, ElevenLabs Impact Program, AAC apps) give a voice to people who've lost speech entirely — they solve *what comes out*, not *understanding what someone who still speaks meant*.

Heard is the only one aimed at the person who **still speaks but isn't understood by a stranger**:

1. **Near-zero cold start** — works day one via TORGO few-shot; the user's own pairs take over within a handful of uses. No enrolment.
2. **Honest by design** — never speaks a confident error; when unsure, it asks. Trust is the product.
3. **Learns per-word, visibly** — every tap is a training pair; personal vocabulary beats any generic model, and compounds with use.
4. **Built for the interaction, not the user** — designed around the thirty seconds with a stranger, not the user's whole daily life.

And it's **complementary, not competitive**, with the voice players: if you've banked or cloned your voice, Heard speaks your recovered sentence *in it*.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend + API | Next.js (App Router) on Vercel |
| DB / auth / storage | Supabase (Postgres, Auth, Storage) |
| ASR | ElevenLabs Scribe v2 (word-level confidence) |
| LLM correction | OpenRouter → Google Gemini 2.5 Flash (v010 few-shot repair prompt + conversation context) |
| Speech / voice out | ElevenLabs TTS + voice cloning |
| Cold-start data | TORGO dysarthric-speech dataset (noisy → verified pairs) |

Keys are server-side only; ASR/LLM keys are never exposed to the browser.

---

## Status

Greenfield hackathon build. Core loop first: **listen → Speak → recover → confirm → speak aloud**, with the learning loop wired live. Sharing (voice / text / avatar / video) is on the roadmap.

## Safety

Heard is an **assistive communication aid, not a medical device** — no diagnosis, no clinical claims. Voice and likeness features use the user's own voice and face with consent.

## Team

- **Emre Yavuz** — [LinkedIn](https://www.linkedin.com/in/dr-emre-yavuz-449216187/)
- **Sevara Bakhodirova** — [LinkedIn](https://www.linkedin.com/in/sevara-bakhodirova-485102205/)
- **Rashad Hosseini** — [LinkedIn](https://www.linkedin.com/in/rashad-hosseini/)
- **Maria** — [LinkedIn](https://www.linkedin.com/in/mariapapz)

## Links

- **Live app:** https://heard-iota.vercel.app/live
- **Demo video:** [Google Vids](https://docs.google.com/videos/d/1071aXKySeums10puedwNaPpqlU0AEusHCbOFS_RzK-0/play?usp=sharing)
- **Design doc** (problem, positioning, protocol, build plan): [design document](https://docs.google.com/document/d/1ki5x6JzXBjzY2-Uuixlsu-S8s1YPa8Isy2QDdHx36Ao/edit)
