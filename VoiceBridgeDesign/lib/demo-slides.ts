import { storyBeats } from "@/lib/landing-copy";

export type DemoPanel = {
  /** Short label under the video frame */
  label: string;
  /** Optional caption */
  caption?: string;
  /**
   * Path under /public once uploaded, e.g. "/demo/live-speaker.mp4".
   * Leave null for the empty template slot.
   */
  src: string | null;
};

type DemoSlideBase = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
};

export type DemoStorySlide = DemoSlideBase & {
  kind: "story";
  cite?: string;
};

export type DemoVideoSlide = DemoSlideBase & {
  kind: "video";
  left: DemoPanel;
  right: DemoPanel;
};

export type DemoTechSlide = DemoSlideBase & {
  kind: "tech";
  points: readonly {
    title: string;
    body: string;
  }[];
};

export type DemoSlide = DemoStorySlide | DemoVideoSlide | DemoTechSlide;

const problemSlides: DemoStorySlide[] = storyBeats.map((beat) => ({
  kind: "story" as const,
  id: `problem-${beat.id}`,
  eyebrow: beat.eyebrow,
  title: beat.title,
  body: beat.body,
  cite: beat.cite || undefined,
}));

/**
 * Pitch demo slides. Drop videos into `public/demo/` and set `src` on video slides.
 */
export const demoSlides: DemoSlide[] = [
  ...problemSlides,
  {
    kind: "video",
    id: "live",
    eyebrow: "Live",
    title: "Be understood in the moment.",
    body: "They speak. Heard listens to the room, recovers what was meant, and says it aloud — after a confirm.",
    left: {
      label: "Speaker",
      caption: "Dysarthric speech",
      src: null,
    },
    right: {
      label: "Heard · Live",
      caption: "Ambient → Speak → Confirm",
      src: null,
    },
  },
  {
    kind: "video",
    id: "compare",
    eyebrow: "Compare",
    title: "Ordinary transcription isn’t enough.",
    body: "Same speech. Generic tools guess. Heard recovers — grounded in the conversation.",
    left: {
      label: "Generic transcription",
      caption: "Non-personalised STT",
      src: null,
    },
    right: {
      label: "Heard",
      caption: "Recovered + confirmed",
      src: null,
    },
  },
  {
    kind: "tech",
    id: "tech",
    eyebrow: "How it recovers",
    title: "Not blind ASR.",
    body: "Grounded recovery with a gate that refuses to invent.",
    points: [
      {
        title: "Ambient",
        body: "Scribe hears the other person in realtime. Session-only — never written to their profile.",
      },
      {
        title: "Gemini",
        body: "User audio plus a short dysarthria prompt and conversation context. Not classic ASR.",
      },
      {
        title: "Consensus gate",
        body: "Five parallel samples vote word-by-word. A no-context control collapses confidence when answers diverge.",
      },
      {
        title: "Confirm → speak",
        body: "Nothing leaves the phone until they tap. Then ElevenLabs speaks only the confirmed line.",
      },
    ],
  },
  {
    kind: "video",
    id: "share",
    eyebrow: "Share",
    title: "Being understood doesn’t stop at the counter.",
    body: "Speak once, confirm, then send a clear voice note or text on the channels they already use.",
    left: {
      label: "Speaker",
      caption: "Message to share",
      src: null,
    },
    right: {
      label: "Heard · Share",
      caption: "Confirm → send",
      src: null,
    },
  },
  {
    kind: "video",
    id: "my-words",
    eyebrow: "My Words",
    title: "It learns your voice as you use it.",
    body: "Every confirm writes a training pair. Next time, the same word resolves first-pass — personal vocabulary that compounds.",
    left: {
      label: "Speaker",
      caption: "Words that used to need a tap",
      src: null,
    },
    right: {
      label: "Heard · My Words",
      caption: "Vocabulary · still learning",
      src: null,
    },
  },
];
