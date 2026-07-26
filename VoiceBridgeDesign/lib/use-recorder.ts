"use client";

import { useRef, useState } from "react";

const log = (...args: unknown[]) => console.info("[heard/recorder]", ...args);

export function useRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  async function start() {
    if (isRecording) {
      log("start ignored — already recording");
      return;
    }
    log("requesting microphone");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
        log("chunk", event.data.size, "bytes", event.data.type || mimeType);
      }
    };
    recorder.onerror = (event) => {
      console.error("[heard/recorder] MediaRecorder error", event);
    };
    // Flush chunks periodically so stop() isn't stuck with an empty blob
    // if the browser never fires a final dataavailable without timeslice.
    recorder.start(250);

    streamRef.current = stream;
    recorderRef.current = recorder;
    setIsRecording(true);
    log("recording started", {
      mimeType: recorder.mimeType,
      state: recorder.state,
    });
  }

  async function stop(): Promise<Blob> {
    const recorder = recorderRef.current;
    if (!recorder) {
      console.error("[heard/recorder] stop called with no active recorder");
      throw new Error("Recorder has not started");
    }

    log("stopping", {
      state: recorder.state,
      chunks: chunksRef.current.length,
    });

    const stopped = new Promise<Blob>((resolve, reject) => {
      const finish = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        setIsRecording(false);
        log("stopped", { bytes: blob.size, type: blob.type });
        if (blob.size === 0) {
          reject(new Error("Recording produced an empty audio blob"));
          return;
        }
        resolve(blob);
      };

      recorder.addEventListener("stop", finish, { once: true });
      // Some browsers only emit the last chunk after requestData().
      try {
        if (recorder.state === "recording") recorder.requestData();
      } catch (err) {
        log("requestData failed", err);
      }
    });

    if (recorder.state === "inactive") {
      log("recorder already inactive — assembling blob from buffered chunks");
      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      setIsRecording(false);
      if (blob.size === 0) throw new Error("Recording produced an empty audio blob");
      return blob;
    }

    recorder.stop();
    return stopped;
  }

  function cancel() {
    log("cancel");
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
  }

  return { isRecording, start, stop, cancel };
}
