"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ConfirmView,
  WordFixView,
  alternativesFor,
} from "@/components/TranscriptConfirm";
import { SpeakBlob } from "@/components/ui/SpeakBlob";
import {
  partnerTranscriptLines,
  userTranscriptDraft,
  wordsFromTranscript,
} from "@/lib/mock-data";

type LiveState =
  | "idle"
  | "listening"
  | "recording"
  | "processing"
  | "confirm"
  | "wordFix";

export default function LivePage() {
  const [state, setState] = useState<LiveState>("idle");
  const [partnerText, setPartnerText] = useState("");
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [words, setWords] = useState(
    wordsFromTranscript(userTranscriptDraft),
  );
  const [showWrongActions, setShowWrongActions] = useState(false);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(
    null,
  );
  const [confirmedMessages, setConfirmedMessages] = useState<string[]>([]);

  const selectedWord =
    selectedWordIndex !== null ? words[selectedWordIndex] : null;

  const alternatives = useMemo(
    () => (selectedWord ? alternativesFor(selectedWord) : []),
    [selectedWord],
  );

  useEffect(() => {
    if (state !== "listening") return;

    const currentLine = partnerTranscriptLines[lineIndex] ?? "";
    if (charIndex < currentLine.length) {
      const t = setTimeout(() => {
        setPartnerText(currentLine.slice(0, charIndex + 1));
        setCharIndex((c) => c + 1);
      }, 38);
      return () => clearTimeout(t);
    }

    if (lineIndex < partnerTranscriptLines.length - 1) {
      const t = setTimeout(() => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
        setPartnerText("");
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [state, lineIndex, charIndex]);

  useEffect(() => {
    if (state !== "processing") return;
    const t = setTimeout(() => {
      setWords(wordsFromTranscript(userTranscriptDraft));
      setShowWrongActions(false);
      setSelectedWordIndex(null);
      setState("confirm");
    }, 1400);
    return () => clearTimeout(t);
  }, [state]);

  function startConversation() {
    setConfirmedMessages([]);
    setPartnerText("");
    setLineIndex(0);
    setCharIndex(0);
    setState("listening");
  }

  function endConversation() {
    setState("idle");
    setPartnerText("");
    setLineIndex(0);
    setCharIndex(0);
    setShowWrongActions(false);
    setSelectedWordIndex(null);
  }

  function confirmCorrect() {
    setConfirmedMessages((prev) => [...prev, words.join(" ")]);
    setShowWrongActions(false);
    setSelectedWordIndex(null);
    setPartnerText("");
    setLineIndex(0);
    setCharIndex(0);
    setState("listening");
  }

  function applyAlternative(alt: string) {
    if (selectedWordIndex === null) return;
    setWords((prev) =>
      prev.map((w, i) => (i === selectedWordIndex ? alt : w)),
    );
    setState("confirm");
    setShowWrongActions(true);
    setSelectedWordIndex(null);
  }

  return (
    <div className="flex h-full min-h-full flex-col px-5 pb-4 pt-6">
      {state === "idle" && (
        <IdleView onStart={startConversation} />
      )}

      {state === "listening" && (
        <ListeningView
          partnerText={partnerText}
          confirmedMessages={confirmedMessages}
          onRecord={() => setState("recording")}
          onEnd={endConversation}
        />
      )}

      {state === "recording" && (
        <RecordingView onStop={() => setState("processing")} />
      )}

      {state === "processing" && <ProcessingView />}

      {state === "confirm" && (
        <ConfirmView
          words={words}
          showWrongActions={showWrongActions}
          selectedWordIndex={selectedWordIndex}
          onCorrect={confirmCorrect}
          onWrong={() => setShowWrongActions(true)}
          onRerecord={() => {
            setShowWrongActions(false);
            setState("recording");
          }}
          onSelectWord={(i) => {
            setSelectedWordIndex(i);
            setState("wordFix");
          }}
        />
      )}

      {state === "wordFix" && selectedWord && (
        <WordFixView
          word={selectedWord}
          alternatives={alternatives}
          onPick={applyAlternative}
          onBack={() => {
            setState("confirm");
            setSelectedWordIndex(null);
          }}
        />
      )}
    </div>
  );
}

function IdleView({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative flex flex-1 flex-col font-body">
      <div className="flex items-start justify-between px-1 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-mute animate-fade-up">
          Heard
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute animate-fade-up">
          Live
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="animate-fade-up [animation-delay:100ms]">
          <SpeakBlob
            onClick={onStart}
            size="hero"
            mode="idle"
            aria-label="Start conversation"
            caption="Start conversation"
          />
        </div>
      </div>
    </div>
  );
}

function ListeningView({
  partnerText,
  confirmedMessages,
  onRecord,
  onEnd,
}: {
  partnerText: string;
  confirmedMessages: string[];
  onRecord: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col animate-fade-up">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan animate-live-dot" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink">
            Live
          </span>
        </div>
        <button
          type="button"
          onClick={onEnd}
          className="min-h-12 rounded-xl px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-ink hover:bg-black/5"
        >
          End
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
        {confirmedMessages.map((msg, i) => (
          <div key={i} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-violet px-4 py-3 text-left text-[15px] leading-relaxed text-white">
              {msg}
            </p>
          </div>
        ))}

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
            They said
          </p>
          <p className="min-h-[4.5rem] font-body text-[26px] font-semibold leading-snug tracking-tight text-ink">
            {partnerText || (
              <span className="text-ink-mute">Listening…</span>
            )}
            {partnerText ? (
              <span className="ml-0.5 inline-block h-6 w-[2px] translate-y-1 bg-violet animate-caret" />
            ) : null}
          </p>
        </div>
      </div>

      <div className="mb-10 mt-2 flex flex-col items-center pb-2">
        <SpeakBlob
          onClick={onRecord}
          aria-label="Record your speech"
          caption="Tap to speak"
        />
      </div>
    </div>
  );
}

function RecordingView({ onStop }: { onStop: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center animate-fade-up">
      <p className="mb-8 text-[14px] font-bold uppercase tracking-[0.14em] text-[#6b1530]">
        Recording
      </p>
      <SpeakBlob
        onClick={onStop}
        mode="recording"
        size="lg"
        aria-label="Stop recording"
      />
      <p className="mt-8 max-w-[14rem] text-center text-base text-ink-soft">
        Speak naturally. Tap to stop when you are done.
      </p>
    </div>
  );
}

function ProcessingView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center animate-fade-up">
      <div className="mb-6">
        <SpeakBlob aria-label="Processing" label="…" />
      </div>
      <p className="text-[24px] font-semibold tracking-tight text-ink">
        Clarifying your words…
      </p>
      <p className="mt-3 text-sm text-ink-mute">Taking a careful listen</p>
    </div>
  );
}

