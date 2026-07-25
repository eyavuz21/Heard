export const partnerTranscriptLines = [
  "How was your morning?",
  "I was thinking we could go to the park later.",
  "Does that sound okay?",
];

export const userTranscriptDraft =
  "Yes that sounds nice I would love to go";

export const wordAlternatives: Record<string, string[]> = {
  Yes: ["Yeah", "Sure", "Okay"],
  that: ["this", "it", "everything"],
  sounds: ["seems", "feels", "looks"],
  nice: ["good", "great", "lovely"],
  I: ["I'd", "We", "I'll"],
  am: ["I'm", "was", "will"],
  would: ["will", "could", "wanna"],
  love: ["like", "want", "prefer"],
  to: ["too", "two", "for"],
  go: ["come", "visit", "leave"],
  Running: ["Leaving", "Coming", "Arriving"],
  a: ["the", "one", "some"],
  few: ["couple", "several", "bit"],
  minutes: ["mins", "moments", "sec"],
  late: ["behind", "delayed", "slow"],
  see: ["meet", "catch", "find"],
  you: ["ya", "u", "y'all"],
  soon: ["shortly", "later", "asap"],
  on: ["in", "along", "onto"],
  my: ["the", "our", "a"],
  way: ["road", "path", "route"],
  Can: ["Could", "Shall", "May"],
  we: ["I", "you", "they"],
  reschedule: ["postpone", "move", "delay"],
  Thank: ["Thanks", "Cheers", "Appreciate"],
  so: ["really", "very", "quite"],
  much: ["loads", "heaps", "ton"],
  Call: ["Ring", "Text", "Ping"],
  me: ["us", "him", "her"],
  when: ["once", "if", "after"],
  free: ["ready", "around", "available"],
};

/** Split transcript into tappable words (strips light punctuation). */
export function wordsFromTranscript(text: string): string[] {
  return text
    .replace(/[—–]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ""))
    .filter(Boolean);
}

export const shareSuggestions = [
  "Running a few minutes late",
  "I am on my way",
  "Can we reschedule?",
  "Thank you so much",
  "Call me when free",
];

export const shareTranscriptDefault =
  "I am running a few minutes late — see you soon.";

export const understoodProgress = {
  rate: 84,
  delta: 12,
  period: "this week",
};

export type WordGroupId = "people" | "places" | "health" | "everyday";

export const wordGroups: {
  id: WordGroupId;
  label: string;
  words: string[];
}[] = [
  {
    id: "people",
    label: "People",
    words: ["Sarah", "Tom", "Maya", "Dr. Chen"],
  },
  {
    id: "places",
    label: "Places",
    words: ["Elm Street", "clinic", "café"],
  },
  {
    id: "health",
    label: "Health",
    words: ["Ropinirole", "physio", "appointment"],
  },
  {
    id: "everyday",
    label: "Everyday",
    words: ["flat white", "later", "thank you"],
  },
];

export const stillLearning = [
  {
    heard: "go",
    as: "come",
    note: "When it comes up, I'll double-check rather than guess.",
  },
  {
    heard: "yes",
    as: "yeah",
    note: "Short confirmations — I'll ask before I assume.",
  },
  {
    heard: "late",
    as: "later",
    note: "I'll pause and confirm the ending.",
  },
];
