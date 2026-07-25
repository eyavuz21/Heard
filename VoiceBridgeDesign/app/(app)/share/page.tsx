"use client";

import { useEffect, useState } from "react";
import { ConfirmView, WordFixView } from "@/components/TranscriptConfirm";
import { BigButton } from "@/components/ui/BigButton";
import { SpeakBlob } from "@/components/ui/SpeakBlob";
import { SuggestionChip } from "@/components/ui/SuggestionChip";
import { Toast } from "@/components/ui/Toast";
import {
  ApiError,
  confirmRelay,
  createSession,
  deleteSession,
  getUserId,
  postRelay,
  type ConfirmSource,
  type RelayResult,
  type WordOption,
} from "@/lib/api";
import { useRecorder } from "@/lib/use-recorder";
import {
  shareSuggestions,
  wordsFromTranscript,
} from "@/lib/mock-data";

type ShareState = "idle" | "recording" | "processing" | "confirm" | "wordFix" | "share";

type ShareKind = "avatar" | "voice" | "text";

export default function SharePage() {
  const [state, setState] = useState<ShareState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [relayResult, setRelayResult] = useState<RelayResult | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null,
  );
  const [words, setWords] = useState<WordOption[]>([]);
  const [source, setSource] = useState<ConfirmSource>("best");
  const [hasEdited, setHasEdited] = useState(false);
  const [voiceMemo, setVoiceMemo] = useState<Blob | null>(null);
  const [showWrongActions, setShowWrongActions] = useState(false);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recorder = useRecorder();

  const transcript =
    hasEdited || !relayResult ? words.map((word) => word.word).join(" ") : relayResult.best;
  const selectedWord =
    selectedWordIndex !== null ? words[selectedWordIndex] : null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function showComingSoon(label: string) {
    setToast(`${label} — coming soon`);
  }

  async function startRecording() {
    const oldSessionId = sessionId;
    if (oldSessionId) {
      await deleteSession(oldSessionId).catch(() => undefined);
      setSessionId(null);
    }
    setErrorMessage(null);
    setRelayResult(null);
    setVoiceMemo(null);
    setWords([]);
    setHasEdited(false);
    setShowWrongActions(false);
    setSelectedWordIndex(null);
    let createdSessionId: string | null = null;
    try {
      const session = await createSession(getUserId());
      createdSessionId = session.session_id;
      setSessionId(session.session_id);
      setState("recording");
      await recorder.start();
    } catch {
      if (createdSessionId) {
        await deleteSession(createdSessionId).catch(() => undefined);
        setSessionId(null);
      }
      setToast("Recording is not available in this browser");
      setState("idle");
    }
  }

  async function stopRecording() {
    if (!sessionId) {
      setErrorMessage("Session expired — record again.");
      setState("idle");
      return;
    }
    setState("processing");
    try {
      const audio = await recorder.stop();
      const result = await postRelay(sessionId, audio);
      setRelayResult(result);
      setWords(result.words.length ? result.words : toWordOptions(result.best));
      setSource("best");
      setHasEdited(false);
      setState("confirm");
    } catch (err) {
      setErrorMessage(messageForError(err));
      setState("idle");
    }
  }

  async function openSystemShare(kind: ShareKind) {
    const labels: Record<ShareKind, string> = {
      avatar: "Avatar video",
      voice: "Voice memo",
      text: "Text",
    };

    if (kind === "avatar") {
      showComingSoon("Avatar video");
      return;
    }

    const title = `Heard — ${labels[kind]}`;
    let payload: ShareData = { title, text: transcript };

    if (kind === "voice") {
      const audio = await ensureVoiceMemo();
      if (!audio) return;
      const file = new File([audio], "heard-message.mp3", { type: "audio/mpeg" });
      payload =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
          ? { title, text: transcript, files: [file] }
          : { title, text: `${transcript}\n\nVoice memo is ready in Heard.` };
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        // User dismissed the sheet — not an error to surface
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard?.writeText(payload.text ?? transcript);
      setToast("Copied — open Share from your device if the sheet didn’t appear");
    } catch {
      setToast("Sharing isn’t available in this browser");
    }
  }

  async function ensureVoiceMemo(): Promise<Blob | null> {
    if (voiceMemo) return voiceMemo;
    if (!relayResult || !transcript.trim()) return null;
    try {
      const audio = await confirmRelay(relayResult.relay_id, transcript, source);
      setVoiceMemo(audio);
      if (sessionId) {
        await deleteSession(sessionId).catch(() => undefined);
        setSessionId(null);
      }
      return audio;
    } catch (err) {
      setToast(messageForError(err));
      return null;
    }
  }

  function pickSentence(sentence: string) {
    setWords(toWordOptions(sentence));
    setSource("alternate");
    setHasEdited(true);
    setShowWrongActions(false);
    setSelectedWordIndex(null);
  }

  function applyAlternative(alt: string) {
    if (selectedWordIndex === null) return;
    setWords((prev) =>
      prev.map((option, i) =>
        i === selectedWordIndex
          ? { ...option, word: alt, alternatives: [], agreement: 1 }
          : option,
      ),
    );
    setSource("alternate");
    setHasEdited(true);
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
              onClick={() => void startRecording()}
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
            onClick={() => void stopRecording()}
            mode="recording"
            size="lg"
            aria-label="Recording in progress"
          />
          <p className="mt-8 text-base text-ink-soft">Tap to stop when you are done.</p>
        </div>
      )}

      {state === "processing" && (
        <div className="flex flex-1 flex-col items-center justify-center animate-fade-up">
          <div className="mb-6">
            <SpeakBlob aria-label="Processing" label="…" />
          </div>
          <p className="text-[24px] font-semibold tracking-tight text-ink">
            Clarifying your words…
          </p>
          <p className="mt-3 max-w-[15rem] text-center text-sm text-ink-mute">
            Taking a careful listen. This can take around twenty seconds.
          </p>
        </div>
      )}

      {state === "confirm" && relayResult && (
        <ConfirmView
          best={relayResult.best}
          words={words}
          confidence={relayResult.confidence}
          needsConfirmation={relayResult.needs_confirmation}
          alternates={relayResult.alternates}
          showWrongActions={showWrongActions}
          selectedWordIndex={selectedWordIndex}
          errorMessage={errorMessage}
          onCorrect={() => setState("share")}
          onWrong={() => setShowWrongActions(true)}
          onRerecord={() => {
            setShowWrongActions(false);
            setSelectedWordIndex(null);
            void startRecording();
          }}
          onPickSentence={pickSentence}
          onSelectWord={(i) => {
            setSelectedWordIndex(i);
            setState("wordFix");
          }}
        />
      )}

      {state === "wordFix" && selectedWord && (
        <WordFixView
          option={selectedWord}
          alternatives={selectedWord.alternatives}
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

function toWordOptions(text: string): WordOption[] {
  return wordsFromTranscript(text).map((word, index) => ({
    index,
    word,
    alternatives: [],
    agreement: 1,
  }));
}

function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === "unavailable") {
      return "Something's wrong on our end — try again in a moment.";
    }
    if (err.kind === "not_found") {
      return "Session expired — record again.";
    }
  }
  return "Something went wrong — try again.";
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
