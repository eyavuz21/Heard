"use client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type ApiErrorKind = "not_found" | "unavailable" | "bad_request" | "unknown";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get kind(): ApiErrorKind {
    if (this.status === 404) return "not_found";
    if (this.status === 503) return "unavailable";
    if (this.status === 400) return "bad_request";
    return "unknown";
  }
}

export type Speaker = "user" | "other";

export type Turn = {
  speaker: Speaker;
  text: string;
  ts: number;
};

export type WordOption = {
  index: number;
  word: string;
  alternatives: string[];
  agreement: number;
};

export type RelayResult = {
  relay_id: string;
  best: string;
  confidence: number;
  alternates: string[];
  uncertain_words: string[];
  words: WordOption[];
  needs_confirmation: boolean;
};

export type ConfirmSource = "best" | "alternate" | "typed";

export type Voice = {
  voice_id: string;
  label: string;
  age: string;
  gender: string;
  accent: string;
};

export type ConfirmedPair = {
  heard: string;
  said: string;
  ts: number;
};

export type Profile = {
  user_id: string;
  pair_count: number;
  first_pass_count: number;
  recent_pairs: ConfirmedPair[];
  vocabulary: string[];
  voice_id: string | null;
};

export const DEFAULT_VOICE_ID = "LcfcDJNUP1GQjkzn1xUU"; // Emily
export const DEFAULT_VOICE_LABEL = "Emily";

export function getUserId(): string {
  const key = "heard:user-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const next =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}

export async function createSession(user_id: string): Promise<{ session_id: string }> {
  return requestJson("/session", {
    method: "POST",
    body: JSON.stringify({ user_id }),
  });
}

export async function deleteSession(sessionId: string): Promise<{ cleared: boolean }> {
  return requestJson(`/session/${sessionId}`, { method: "DELETE" });
}

export async function createScribeToken(
  sessionId: string,
): Promise<{ token: string }> {
  return requestJson(`/session/${sessionId}/scribe-token`, { method: "POST" });
}

export async function postAmbient(
  sessionId: string,
  text: string,
): Promise<{ text: string; appended: boolean }> {
  return requestJson(`/session/${sessionId}/ambient`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function postRelay(
  sessionId: string,
  audio: Blob,
  options?: { useProfile?: boolean },
): Promise<RelayResult> {
  // Live turns off profile/DB few-shots; Share keeps them for personalised recovery.
  const suffix = options?.useProfile === false ? "?use_profile=false" : "";
  console.info("[heard/api] postRelay", {
    sessionId,
    bytes: audio.size,
    type: audio.type,
    useProfile: options?.useProfile !== false,
    url: `${API_BASE_URL}/session/${sessionId}/relay${suffix}`,
  });
  return requestJson(`/session/${sessionId}/relay${suffix}`, {
    method: "POST",
    body: audioForm(audio),
  });
}

export async function confirmRelay(
  relayId: string,
  chosen_text: string,
  source: ConfirmSource,
  voice_id?: string,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/relay/${relayId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chosen_text, source, voice_id }),
  });
  if (!response.ok) throw await toApiError(response);
  return response.blob();
}

export async function getThread(
  sessionId: string,
  speaker?: Speaker,
): Promise<{ session_id: string; turns: Turn[] }> {
  const suffix = speaker ? `?speaker=${speaker}` : "";
  return requestJson(`/session/${sessionId}/thread${suffix}`);
}

export async function getVoices(): Promise<Voice[]> {
  return requestJson("/voices");
}

export async function getProfile(userId: string): Promise<Profile> {
  return requestJson(`/profile/${userId}`);
}

export async function cloneVoice(
  userId: string,
  samples: Blob[],
): Promise<{ voice_id: string; label: string }> {
  const form = new FormData();
  samples.forEach((sample, index) => {
    form.append("files", sample, `sample-${index + 1}.webm`);
  });
  return requestJson(`/profile/${userId}/voice/clone`, {
    method: "POST",
    body: form,
  });
}

export async function resetVoice(
  userId: string,
): Promise<{ voice_id: string; label: string }> {
  return requestJson(`/profile/${userId}/voice`, { method: "DELETE" });
}

export async function synthesizeSpeech(
  text: string,
  voice_id?: string | null,
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voice_id || undefined }),
  });
  if (!response.ok) throw await toApiError(response);
  return response.blob();
}

function audioForm(audio: Blob): FormData {
  const form = new FormData();
  form.append("audio", audio, "recording.webm");
  return form;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const method = init?.method ?? "GET";
  console.info("[heard/api] →", method, url);
  const started = performance.now();
  const headers =
    init?.body instanceof FormData
      ? init.headers
      : { "Content-Type": "application/json", ...init?.headers };
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (err) {
    console.error("[heard/api] network error", method, url, err);
    throw err;
  }
  console.info(
    "[heard/api] ←",
    method,
    url,
    response.status,
    `${Math.round(performance.now() - started)}ms`,
  );
  if (!response.ok) throw await toApiError(response);
  return response.json();
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail = response.statusText;
  try {
    const body = await response.json();
    detail = typeof body.detail === "string" ? body.detail : detail;
  } catch {
    detail = await response.text().catch(() => detail);
  }
  console.error("[heard/api] error body", response.status, detail);
  return new ApiError(response.status, detail);
}
