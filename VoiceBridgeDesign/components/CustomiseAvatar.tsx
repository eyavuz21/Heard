"use client";

import { useEffect, useState } from "react";
import { BigButton } from "@/components/ui/BigButton";
import { SpeakBlob } from "@/components/ui/SpeakBlob";
import {
  ApiError,
  DEFAULT_VOICE_LABEL,
  cloneVoice,
  getProfile,
  getUserId,
  resetVoice,
  synthesizeSpeech,
} from "@/lib/api";
import { useRecorder } from "@/lib/use-recorder";

const PREVIEW_LINE = "Hi — this is my Heard voice.";

type Props = {
  onClose: () => void;
  onToast: (message: string) => void;
};

export function CustomiseAvatar({ onClose, onToast }: Props) {
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [cloning, setCloning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRecorder();

  const activeLabel = voiceId ? "Your voice" : DEFAULT_VOICE_LABEL;
  const usingClone = Boolean(voiceId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const profile = await getProfile(getUserId());
        if (!cancelled) setVoiceId(profile.voice_id);
      } catch {
        if (!cancelled) setVoiceId(null);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function toggleSampleRecording() {
    if (cloning || previewing || loadingProfile) return;
    setError(null);
    if (recorder.isRecording) {
      const sample = await recorder.stop();
      if (sample.size < 1000) {
        setError("Recording was too short — try again for about 10 seconds.");
        return;
      }
      setCloning(true);
      try {
        const result = await cloneVoice(getUserId(), [sample]);
        setVoiceId(result.voice_id);
        onToast("Voice cloned — preview it below");
        await playPreview(result.voice_id);
      } catch (err) {
        setError(messageForError(err));
      } finally {
        setCloning(false);
      }
      return;
    }
    try {
      await recorder.start();
    } catch {
      setError("Microphone access is needed to clone your voice.");
    }
  }

  async function playPreview(id?: string | null) {
    setPreviewing(true);
    setError(null);
    try {
      const audio = await synthesizeSpeech(PREVIEW_LINE, id ?? voiceId);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(audio);
      });
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setPreviewing(false);
    }
  }

  async function switchToEmily() {
    setError(null);
    try {
      await resetVoice(getUserId());
      setVoiceId(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      onToast(`Back to ${DEFAULT_VOICE_LABEL}`);
    } catch (err) {
      setError(messageForError(err));
    }
  }

  return (
    <div className="flex flex-1 flex-col animate-fade-up">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
          Customise avatar
        </p>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 rounded-xl px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-ink hover:bg-black/5"
        >
          Done
        </button>
      </div>

      <p className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
        Your speaking voice
      </p>
      <p className="mt-2 text-base leading-relaxed text-ink-soft">
        Default is {DEFAULT_VOICE_LABEL}. Clone your own voice with a short
        sample for share memos and speak-out.
      </p>

      <div className="mt-6 rounded-2xl bg-white/70 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
          Active voice
        </p>
        <p className="mt-1 text-[18px] font-semibold text-ink">
          {loadingProfile ? "Loading…" : activeLabel}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {usingClone
            ? "Instant Voice Clone from your sample"
            : "Default stock voice for all readouts"}
        </p>
      </div>

      <div className="mt-8 flex flex-col items-center">
        <SpeakBlob
          onClick={() => void toggleSampleRecording()}
          mode={recorder.isRecording ? "recording" : "idle"}
          size="lg"
          aria-label={
            recorder.isRecording ? "Stop and clone voice" : "Record voice sample"
          }
          caption={
            cloning
              ? "Cloning…"
              : recorder.isRecording
                ? "Tap to stop & clone"
                : "Record a 10s sample"
          }
        />
        <p className="mt-4 max-w-[18rem] text-center text-sm text-ink-mute">
          Speak naturally for about ten seconds. Clearer samples make a better
          clone.
        </p>
      </div>

      {previewUrl && (
        <div className="mt-6 rounded-2xl bg-white/70 px-4 py-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
            Preview
          </p>
          <audio controls src={previewUrl} preload="metadata" className="share-voice-audio">
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {error && (
        <p className="mt-4 text-center text-sm font-semibold text-[#6b1530]">
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <BigButton
          variant="secondary"
          disabled={previewing || cloning || loadingProfile}
          onClick={() => void playPreview(voiceId)}
        >
          {previewing ? "Preparing preview…" : `Preview ${activeLabel}`}
        </BigButton>
        {usingClone && (
          <BigButton variant="ghost" onClick={() => void switchToEmily()}>
            Use {DEFAULT_VOICE_LABEL} instead
          </BigButton>
        )}
      </div>
    </div>
  );
}

function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = err.message.replace(/^voice clone unavailable:\s*/i, "").trim();
    if (err.kind === "bad_request") {
      return detail.includes("unusable")
        ? "That sample couldn’t be used — try a longer, clearer recording."
        : detail || "That sample couldn’t be used — try a longer, clearer recording.";
    }
    if (err.kind === "unavailable") {
      if (/api[_ ]?key|not set/i.test(detail)) {
        return "ElevenLabs API key isn’t configured on the server.";
      }
      if (/401|403|permission|plan|quota|limit/i.test(detail)) {
        return "ElevenLabs rejected the clone — check your account plan allows Instant Voice Cloning.";
      }
      return detail
        ? `Voice clone failed: ${detail.slice(0, 160)}`
        : "Voice service isn’t available right now — try again shortly.";
    }
  }
  return "Something went wrong — try again.";
}
