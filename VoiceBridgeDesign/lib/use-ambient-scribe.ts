"use client";

import { useEffect, useRef } from "react";
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
 * Streams ambient mic audio to ElevenLabs Scribe realtime and posts committed
 * text to the backend thread. Audio never hits our API.
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

  useEffect(() => {
    if (!enabled || !sessionId) return;

    const activeSessionId = sessionId;
    let cancelled = false;
    let connection: RealtimeConnection | null = null;

    async function start() {
      try {
        const { token } = await createScribeToken(activeSessionId);
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
          if (text) onPartialRef.current(text);
        });

        connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
          const text = data.text?.trim() ?? "";
          if (!text || cancelled) return;
          onCommittedRef.current(text);
          void postAmbient(activeSessionId, text).catch((err: unknown) => {
            if (err instanceof ApiError && err.kind === "not_found") {
              onSessionLostRef.current();
            }
          });
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
  }, [sessionId, enabled]);
}
