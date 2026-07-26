"use client";

import { useEffect, useState } from "react";
import { CustomiseAvatar } from "@/components/CustomiseAvatar";
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

type ShareState =
  | "idle"
  | "recording"
  | "processing"
  | "confirm"
  | "wordFix"
  | "preparingVoice"
  | "share"
  | "customise";

type ShareKind = "avatar" | "voice" | "text";

const AVATAR_VIDEO_SRC = "/avatar-preview.mp4";

export default function SharePage() {
  const [state, setState] = useState<ShareState>("idle");
  const [returnState, setReturnState] = useState<ShareState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [relayResult, setRelayResult] = useState<RelayResult | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null,
  );
  const [words, setWords] = useState<WordOption[]>([]);
  const [source, setSource] = useState<ConfirmSource>("best");
  const [hasEdited, setHasEdited] = useState(false);
  const [voiceMemo, setVoiceMemo] = useState<Blob | null>(null);
  const [voiceMemoUrl, setVoiceMemoUrl] = useState<string | null>(null);
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

  useEffect(() => {
    return () => {
      if (voiceMemoUrl) URL.revokeObjectURL(voiceMemoUrl);
    };
  }, [voiceMemoUrl]);

  function openCustomise() {
    setReturnState(state === "customise" ? "idle" : state);
    setState("customise");
  }

  function clearVoiceMemo() {
    setVoiceMemoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVoiceMemo(null);
  }

  function setVoiceMemoBlob(audio: Blob) {
    setVoiceMemoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(audio);
    });
    setVoiceMemo(audio);
  }

  async function startRecording() {
    console.info("[heard/share] startRecording", { sessionId });
    const oldSessionId = sessionId;
    if (oldSessionId) {
      await deleteSession(oldSessionId).catch(() => undefined);
      setSessionId(null);
    }
    setErrorMessage(null);
    setRelayResult(null);
    clearVoiceMemo();
    setWords([]);
    setHasEdited(false);
    setShowWrongActions(false);
    setSelectedWordIndex(null);
    let createdSessionId: string | null = null;
    try {
      const session = await createSession(getUserId());
      createdSessionId = session.session_id;
      setSessionId(session.session_id);
      console.info("[heard/share] session created", session.session_id);
      setState("recording");
      await recorder.start();
      console.info("[heard/share] recorder started");
    } catch (err) {
      console.error("[heard/share] startRecording failed", err);
      if (createdSessionId) {
        await deleteSession(createdSessionId).catch(() => undefined);
        setSessionId(null);
      }
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Recording is not available in this browser",
      );
      setToast("Recording is not available in this browser");
      setState("idle");
    }
  }

  async function stopRecording() {
    console.info("[heard/share] stopRecording clicked", { sessionId });
    if (!sessionId) {
      console.error("[heard/share] no sessionId at stop");
      setErrorMessage("Session expired — record again.");
      setState("idle");
      return;
    }
    setState("processing");
    try {
      const audio = await recorder.stop();
      console.info("[heard/share] audio ready", {
        bytes: audio.size,
        type: audio.type,
      });
      const result = await postRelay(sessionId, audio);
      console.info("[heard/share] relay result", {
        relay_id: result.relay_id,
        best: result.best,
        confidence: result.confidence,
        needs_confirmation: result.needs_confirmation,
      });
      setRelayResult(result);
      setWords(result.words.length ? result.words : toWordOptions(result.best));
      setSource("best");
      setHasEdited(false);
      setErrorMessage(null);
      setState("confirm");
    } catch (err) {
      console.error("[heard/share] stopRecording failed", err);
      setErrorMessage(messageForError(err));
      setState("idle");
    }
  }

  async function confirmTranscript() {
    const text = transcript.trim();
    if (!text) return;

    // Already synthesized — just return to share options.
    if (voiceMemo) {
      setState("share");
      return;
    }
    if (!relayResult) return;

    setErrorMessage(null);
    setState("preparingVoice");
    try {
      const audio = await confirmRelay(relayResult.relay_id, text, source);
      setVoiceMemoBlob(audio);
      if (sessionId) {
        await deleteSession(sessionId).catch(() => undefined);
        setSessionId(null);
      }
      setState("share");
    } catch (err) {
      setErrorMessage(messageForError(err));
      setState("confirm");
    }
  }

  async function loadAvatarVideoFile(): Promise<File> {
    const response = await fetch(AVATAR_VIDEO_SRC);
    if (!response.ok) throw new Error("avatar video missing");
    const blob = await response.blob();
    return new File([blob], "heard-avatar.mp4", {
      type: blob.type || "video/mp4",
    });
  }

  async function openSystemShare(kind: ShareKind) {
    const labels: Record<ShareKind, string> = {
      avatar: "Avatar video",
      voice: "Voice memo",
      text: "Text",
    };

    const title = `Heard — ${labels[kind]}`;
    let payload: ShareData = { title, text: transcript };
    let downloadFallback: { url: string; filename: string; revoke?: boolean } | null =
      null;

    if (kind === "avatar") {
      try {
        const file = await loadAvatarVideoFile();
        const canShareFiles =
          typeof navigator !== "undefined" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] });
        payload = canShareFiles
          ? { title, text: transcript, files: [file] }
          : { title, text: `${transcript}\n\nAvatar video is ready in Heard.` };
        if (!canShareFiles) {
          downloadFallback = {
            url: AVATAR_VIDEO_SRC,
            filename: "heard-avatar.mp4",
          };
        }
      } catch {
        setToast("Avatar video isn’t available right now.");
        return;
      }
    }

    if (kind === "voice") {
      const audio = voiceMemo;
      if (!audio) {
        setToast("Voice memo isn’t ready — confirm the transcript again.");
        return;
      }
      const file = new File([audio], "heard-message.mp3", { type: "audio/mpeg" });
      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      payload = canShareFiles
        ? { title, text: transcript, files: [file] }
        : { title, text: `${transcript}\n\nVoice memo is ready in Heard.` };
      if (!canShareFiles) {
        const url = voiceMemoUrl ?? URL.createObjectURL(audio);
        downloadFallback = {
          url,
          filename: "heard-message.mp3",
          revoke: !voiceMemoUrl,
        };
      }
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

    if (downloadFallback) {
      const anchor = document.createElement("a");
      anchor.href = downloadFallback.url;
      anchor.download = downloadFallback.filename;
      anchor.click();
      if (downloadFallback.revoke) URL.revokeObjectURL(downloadFallback.url);
      setToast(
        kind === "avatar" ? "Avatar video downloaded" : "Voice memo downloaded",
      );
      return;
    }

    try {
      await navigator.clipboard?.writeText(payload.text ?? transcript);
      setToast("Copied — open Share from your device if the sheet didn’t appear");
    } catch {
      setToast("Sharing isn’t available in this browser");
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

      {(state === "idle" ||
        state === "recording" ||
        state === "preparingVoice" ||
        state === "share") && (
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink">
            Heard
          </h1>
          <button
            type="button"
            onClick={openCustomise}
            className="min-h-12 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink-soft transition hover:bg-surface-muted active:scale-[0.98]"
          >
            Customise avatar
          </button>
        </header>
      )}

      {state === "customise" && (
        <CustomiseAvatar
          onClose={() => setState(returnState === "customise" ? "idle" : returnState)}
          onToast={setToast}
        />
      )}

      {state === "idle" && (
        <div className="flex flex-1 flex-col animate-fade-up">
          <p className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
            Share a message
          </p>
          <p className="mt-2 text-base leading-relaxed text-ink-soft">
            Not a live conversation — record once, then send.
          </p>

          {errorMessage && (
            <p className="mt-4 rounded-2xl bg-[#f8e8ec] px-4 py-3 text-sm font-semibold text-[#6b1530]">
              {errorMessage}
            </p>
          )}

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

      {state === "preparingVoice" && (
        <div className="flex flex-1 flex-col items-center justify-center animate-fade-up">
          <div className="mb-6">
            <SpeakBlob aria-label="Preparing voice memo" label="…" />
          </div>
          <p className="text-[24px] font-semibold tracking-tight text-ink">
            Preparing your voice memo…
          </p>
          <p className="mt-3 max-w-[16rem] text-center text-sm text-ink-mute">
            ElevenLabs is reading your message aloud so you can preview and share it.
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
          onCorrect={() => void confirmTranscript()}
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
          <p className="mt-2 mb-5 line-clamp-2 text-base text-ink-soft">
            {transcript}
          </p>

          <div className="share-voice-preview mb-5">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
              Avatar preview
            </p>
            <video
              controls
              playsInline
              preload="metadata"
              src={AVATAR_VIDEO_SRC}
              className="share-avatar-video"
            >
              Your browser does not support video playback.
            </video>
          </div>

          {voiceMemoUrl && (
            <div className="share-voice-preview mb-5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
                Voice memo preview
              </p>
              <audio
                controls
                src={voiceMemoUrl}
                preload="metadata"
                className="share-voice-audio"
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          )}

          <div className="share-options">
            <ShareChoice
              title="Avatar video"
              subtitle="Share this avatar clip"
              tone="avatar"
              onClick={() => void openSystemShare("avatar")}
            />
            <ShareChoice
              title="Voice memo"
              subtitle={
                voiceMemo
                  ? "Share the audio file"
                  : "Reconstructed voice recording"
              }
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
      return err.message || "Something's wrong on our end — try again in a moment.";
    }
    if (err.kind === "not_found") {
      return "Session expired — record again.";
    }
    if (err.kind === "bad_request") {
      return err.message || "That recording couldn’t be used — try again.";
    }
    return err.message || "Something went wrong — try again.";
  }
  if (err instanceof TypeError) {
    return "Can’t reach the API — check the network connection.";
  }
  if (err instanceof Error && err.message) {
    return err.message;
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
