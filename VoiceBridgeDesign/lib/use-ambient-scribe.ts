"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  CommitStrategy,
  RealtimeEvents,
  Scribe,
  type RealtimeConnection,
} from "@elevenlabs/client";
import { ApiError, createScribeToken, postAmbient } from "@/lib/api";

type AmbientScribeOptions = {
  sessionId: string | null;
  enabled: boolean;
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onSessionLost: () => void;
};

/**
 * How long to wait, on flush, for Scribe to turn a partial into a commit.
 *
 * VAD commits on a pause, and the natural moment to tap Speak is the moment the other
 * person stops talking -- so their last sentence is usually still a partial. Long enough
 * to catch that commit, short enough that the tap still feels immediate.
 */
const FLUSH_GRACE_MS = 600;

/**
 * Streams ambient mic audio to ElevenLabs Scribe realtime and posts committed
 * text to the backend thread. Audio never hits our API.
 *
 * Returns `flush`, which the caller MUST await before tearing the connection down --
 * see the comment on flush itself. Without it the other person's most recent utterance
 * is silently lost, which is precisely the one the recogniser needs most.
 */
export function useAmbientScribe({
  sessionId,
  enabled,
  onPartial,
  onCommitted,
  onSessionLost,
}: AmbientScribeOptions) {
  const onPartialRef = useRef(onPartial);
  const onCommittedRef = useRef(onCommitted);
  const onSessionLostRef = useRef(onSessionLost);
  onPartialRef.current = onPartial;
  onCommittedRef.current = onCommitted;
  onSessionLostRef.current = onSessionLost;

  // The latest partial that has NOT yet been superseded by a commit. This is the text
  // at risk of being dropped, and what flush falls back to posting.
  const pendingPartialRef = useRef<string>("");
  const sessionIdRef = useRef<string | null>(sessionId);
  sessionIdRef.current = sessionId;
  // Set while a flush is waiting, so the commit handler can wake it early.
  const flushWaiterRef = useRef<(() => void) | null>(null);

  const post = useCallback(async (text: string) => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId || !text.trim()) return;
    try {
      await postAmbient(activeSessionId, text);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.kind === "not_found") {
        onSessionLostRef.current();
      }
    }
  }, []);

  /**
   * Commit whatever ambient speech is still in flight, before the connection closes.
   *
   * Waits briefly for Scribe to emit a real commit; if none arrives, posts the last
   * partial instead. A partial is a slightly rougher transcript than a commit, but the
   * alternative is the model being asked to recover a reply to a question it was never
   * told about -- and the interface has already shown that question to the user, so
   * dropping it silently is the worst of both.
   */
  const flush = useCallback(async () => {
    if (!pendingPartialRef.current) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        flushWaiterRef.current = null;
        resolve();
      };
      flushWaiterRef.current = finish;
      setTimeout(finish, FLUSH_GRACE_MS);
    });

    const leftover = pendingPartialRef.current.trim();
    pendingPartialRef.current = "";
    if (leftover) await post(leftover);
  }, [post]);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    let cancelled = false;
    let connection: RealtimeConnection | null = null;

    async function start() {
      try {
        const { token } = await createScribeToken(sessionId as string);
        if (cancelled) return;

        connection = Scribe.connect({
          token,
          modelId: "scribe_v2_realtime",
          commitStrategy: CommitStrategy.VAD,
          languageCode: "en",
          microphone: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
          },
        });

        connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
          const text = data.text?.trim() ?? "";
          if (!text) return;
          pendingPartialRef.current = text;
          onPartialRef.current(text);
        });

        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
          const text = data.text?.trim() ?? "";
          if (!text) return;
          // A commit supersedes the partial it grew out of, so clear the fallback
          // before posting -- otherwise flush would post the same words twice.
          pendingPartialRef.current = "";
          onCommittedRef.current(text);
          void post(text);
          // Deliberately NOT gated on `cancelled`: a commit that lands during teardown
          // is the last thing the other person said, which is the most valuable turn
          // in the thread. Wake any waiting flush so the tap is not held longer than
          // it needs to be.
          flushWaiterRef.current?.();
        });

        connection.on(RealtimeEvents.ERROR, (error) => {
          console.warn("ambient scribe error", error);
        });
      } catch (err) {
        if (err instanceof ApiError && err.kind === "not_found") {
          onSessionLostRef.current();
          return;
        }
        // Ambient is best-effort; user can still speak without partner context.
        console.warn("ambient scribe failed to start", err);
      }
    }

    void start();

    return () => {
      cancelled = true;
      connection?.close();
      connection = null;
    };
  }, [sessionId, enabled, post]);

  return { flush };
}
