"use client";

import { useState } from "react";
import { ConfirmView, WordFixView } from "@/components/TranscriptConfirm";
import { SpeakBlob } from "@/components/ui/SpeakBlob";
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
import { useAmbientScribe } from "@/lib/use-ambient-scribe";
import { useRecorder } from "@/lib/use-recorder";
import {
  wordsFromTranscript,
} from "@/lib/mock-data";

type LiveState =
  | "idle"
  | "listening"
  | "recording"
  | "processing"
  | "confirm"
  | "wordFix"
  | "speaking";

export default function LivePage() {
  const [state, setState] = useState<LiveState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [partnerText, setPartnerText] = useState("");
  const [relayResult, setRelayResult] = useState<RelayResult | null>(null);
  const [words, setWords] = useState<WordOption[]>([]);
  const [source, setSource] = useState<ConfirmSource>("best");
  const [hasEdited, setHasEdited] = useState(false);
  const [showWrongActions, setShowWrongActions] = useState(false);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(
    null,
  );
  const [confirmedMessages, setConfirmedMessages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recorder = useRecorder();

  const selectedWord =
    selectedWordIndex !== null ? words[selectedWordIndex] : null;

  useAmbientScribe({
    sessionId,
    enabled: state === "listening",
    onPartial: (text) => setPartnerText(text),
    onCommitted: (text) => setPartnerText(text),
    onSessionLost: () => {
      setErrorMessage("Session expired — restart the conversation.");
      setState("idle");
    },
  });

  async function startConversation() {
    setErrorMessage(null);
    setConfirmedMessages([]);
    setPartnerText("");
    try {
      const session = await createSession(getUserId());
      setSessionId(session.session_id);
      setState("listening");
    } catch {
      setErrorMessage("Something's wrong on our end — try again in a moment.");
    }
  }

  async function endConversation() {
    const id = sessionId;
    setSessionId(null);
    if (id) await deleteSession(id).catch(() => undefined);
    recorder.cancel();
    setState("idle");
    setPartnerText("");
    setShowWrongActions(false);
    setSelectedWordIndex(null);
  }

  async function startUserRecording() {
    setErrorMessage(null);
    setShowWrongActions(false);
    setSelectedWordIndex(null);
    setState("recording");
    try {
      await recorder.start();
    } catch {
      setErrorMessage("Recording is not available in this browser.");
      setState("listening");
    }
  }

  async function stopUserRecording() {
    if (!sessionId) {
      setErrorMessage("Session expired — restart the conversation.");
      setState("idle");
      return;
    }

    setState("processing");
    try {
      const audio = await recorder.stop();
      const result = await postRelay(sessionId, audio, { useProfile: false });
      setRelayResult(result);
      setWords(result.words.length ? result.words : toWordOptions(result.best));
      setSource("best");
      setHasEdited(false);
      setShowWrongActions(false);
      setSelectedWordIndex(null);
      setState("confirm");
    } catch (err) {
      setErrorMessage(messageForError(err));
      setState(err instanceof ApiError && err.kind === "not_found" ? "idle" : "listening");
    }
  }

  async function confirmCorrect() {
    if (!relayResult) return;
    const text = hasEdited ? words.map((word) => word.word).join(" ") : relayResult.best;
    if (!text.trim()) return;

    setState("speaking");
    setErrorMessage(null);
    try {
      const audio = await confirmRelay(relayResult.relay_id, text, source);
      await playAudio(audio);
      setConfirmedMessages((prev) => [...prev, text]);
      setRelayResult(null);
      setWords([]);
      setShowWrongActions(false);
      setSelectedWordIndex(null);
      setPartnerText("");
      setState("listening");
    } catch (err) {
      setErrorMessage(messageForError(err));
      setState("confirm");
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
    <div className="flex h-full min-h-full flex-col px-5 pb-4 pt-6">
      {state === "idle" && (
        <IdleView onStart={() => void startConversation()} errorMessage={errorMessage} />
      )}

      {state === "listening" && (
        <ListeningView
          partnerText={partnerText}
          confirmedMessages={confirmedMessages}
          onRecord={() => void startUserRecording()}
          onEnd={() => void endConversation()}
        />
      )}

      {state === "recording" && (
        <RecordingView onStop={() => void stopUserRecording()} />
      )}

      {state === "processing" && <ProcessingView />}
      {state === "speaking" && <SpeakingView />}

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
          onCorrect={() => void confirmCorrect()}
          onWrong={() => setShowWrongActions(true)}
          onRerecord={() => {
            setShowWrongActions(false);
            void startUserRecording();
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
    </div>
  );
}

function IdleView({
  onStart,
  errorMessage,
}: {
  onStart: () => void;
  errorMessage: string | null;
}) {
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
          {errorMessage && (
            <p className="mt-6 max-w-[16rem] text-center text-sm font-semibold text-[#6b1530]">
              {errorMessage}
            </p>
          )}
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
      <p className="mt-3 max-w-[15rem] text-center text-sm text-ink-mute">
        Taking a careful listen. This can take around twenty seconds.
      </p>
    </div>
  );
}

function SpeakingView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center animate-fade-up">
      <div className="mb-6">
        <SpeakBlob aria-label="Speaking now" label="▶" />
      </div>
      <p className="text-[24px] font-semibold tracking-tight text-ink">
        Speaking now
      </p>
      <p className="mt-3 text-sm text-ink-mute">Playing your confirmed words</p>
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

async function playAudio(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    await audio.play();
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === "unavailable") {
      return "Something's wrong on our end — try again in a moment.";
    }
    if (err.kind === "not_found") {
      return "Session expired — restart the conversation.";
    }
  }
  return "Something went wrong — try again.";
}
