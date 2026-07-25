"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ConfirmView,
  WordFixView,
  alternativesFor,
} from "@/components/TranscriptConfirm";
import { BigButton } from "@/components/ui/BigButton";
import { SpeakBlob } from "@/components/ui/SpeakBlob";
import { SuggestionChip } from "@/components/ui/SuggestionChip";
import { Toast } from "@/components/ui/Toast";
import {
  shareSuggestions,
  shareTranscriptDefault,
  wordsFromTranscript,
} from "@/lib/mock-data";

type ShareState = "idle" | "recording" | "confirm" | "wordFix" | "share";

type ShareKind = "avatar" | "voice" | "text";

export default function SharePage() {
  const [state, setState] = useState<ShareState>("idle");
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null,
  );
  const [words, setWords] = useState<string[]>(
    wordsFromTranscript(shareTranscriptDefault),
  );
  const [showWrongActions, setShowWrongActions] = useState(false);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  const transcript = words.join(" ");
  const selectedWord =
    selectedWordIndex !== null ? words[selectedWordIndex] : null;
  const alternatives = useMemo(
    () => (selectedWord ? alternativesFor(selectedWord) : []),
    [selectedWord],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (state !== "recording") return;
    const t = setTimeout(() => {
      const next = selectedSuggestion
        ? selectedSuggestion.endsWith(".")
          ? selectedSuggestion
          : `${selectedSuggestion}.`
        : shareTranscriptDefault;
      setWords(wordsFromTranscript(next));
      setShowWrongActions(false);
      setSelectedWordIndex(null);
      setState("confirm");
    }, 1600);
    return () => clearTimeout(t);
  }, [state, selectedSuggestion]);

  function showComingSoon(label: string) {
    setToast(`${label} — coming soon`);
  }

  async function openSystemShare(kind: ShareKind) {
    const labels: Record<ShareKind, string> = {
      avatar: "Avatar video",
      voice: "Voice memo",
      text: "Text",
    };
    const title = `Heard — ${labels[kind]}`;
    const text =
      kind === "text"
        ? transcript
        : `${transcript}\n\nShared as ${labels[kind]} via Heard`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err) {
        // User dismissed the sheet — not an error to surface
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard?.writeText(text);
      setToast("Copied — open Share from your device if the sheet didn’t appear");
    } catch {
      setToast("Sharing isn’t available in this browser");
    }
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
    <div className="relative flex h-full min-h-full flex-col px-5 pb-4 pt-5">
      <Toast message={toast ?? ""} visible={Boolean(toast)} />

      {(state === "idle" || state === "recording" || state === "share") && (
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink">
            Heard
          </h1>
          <button
            type="button"
            onClick={() => showComingSoon("Customise avatar")}
            className="min-h-12 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink-soft transition hover:bg-surface-muted active:scale-[0.98]"
          >
            Customise avatar
          </button>
        </header>
      )}

      {state === "idle" && (
        <div className="flex flex-1 flex-col animate-fade-up">
          <p className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
            Share a message
          </p>
          <p className="mt-2 text-base leading-relaxed text-ink-soft">
            Not a live conversation — record once, then send.
          </p>

          <p className="mt-7 mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
            Suggestions for you
          </p>
          <div className="flex flex-wrap gap-2">
            {shareSuggestions.map((s) => (
              <SuggestionChip
                key={s}
                label={s}
                selected={selectedSuggestion === s}
                onClick={() =>
                  setSelectedSuggestion((prev) => (prev === s ? null : s))
                }
              />
            ))}
          </div>

          <div className="mt-auto flex flex-col items-center pt-10">
            <SpeakBlob
              onClick={() => setState("recording")}
              aria-label="Record a message"
              size="lg"
              caption={
                selectedSuggestion
                  ? "Record with this suggestion"
                  : "Tap to record"
              }
            />
          </div>
        </div>
      )}

      {state === "recording" && (
        <div className="flex flex-1 flex-col items-center justify-center animate-fade-up">
          <p className="mb-8 text-[14px] font-bold uppercase tracking-[0.14em] text-[#6b1530]">
            Recording
          </p>
          <SpeakBlob
            mode="recording"
            size="lg"
            aria-label="Recording in progress"
          />
          <p className="mt-8 text-base text-ink-soft">Listening carefully…</p>
        </div>
      )}

      {state === "confirm" && (
        <ConfirmView
          words={words}
          showWrongActions={showWrongActions}
          selectedWordIndex={selectedWordIndex}
          onCorrect={() => setState("share")}
          onWrong={() => setShowWrongActions(true)}
          onRerecord={() => {
            setShowWrongActions(false);
            setSelectedWordIndex(null);
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

      {state === "share" && (
        <div className="flex flex-1 flex-col animate-fade-up">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
            Share as
          </p>
          <p className="mt-2 mb-6 line-clamp-2 text-base text-ink-soft">
            {transcript}
          </p>

          <div className="share-options">
            <ShareChoice
              title="Avatar video"
              subtitle="Speak with your custom avatar"
              tone="avatar"
              onClick={() => void openSystemShare("avatar")}
            />
            <ShareChoice
              title="Voice memo"
              subtitle="Reconstructed voice recording"
              tone="voice"
              onClick={() => void openSystemShare("voice")}
            />
            <ShareChoice
              title="Text"
              subtitle="WhatsApp, Messages, and more"
              tone="text"
              onClick={() => void openSystemShare("text")}
            />
          </div>

          <div className="mt-auto pt-6">
            <BigButton
              variant="ghost"
              onClick={() => {
                setShowWrongActions(false);
                setState("confirm");
              }}
            >
              Back to transcript
            </BigButton>
          </div>
        </div>
      )}
    </div>
  );
}

function ShareChoice({
  title,
  subtitle,
  tone,
  onClick,
}: {
  title: string;
  subtitle: string;
  tone: "avatar" | "voice" | "text";
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="share-choice group">
      <span
        className={`share-choice-glob share-choice-glob--${tone}`}
        aria-hidden
      />
      <span className="share-choice-copy">
        <span className="share-choice-title">{title}</span>
        <span className="share-choice-sub">{subtitle}</span>
      </span>
    </button>
  );
}
