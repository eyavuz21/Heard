"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getProfile,
  getUserId,
  type Profile,
} from "@/lib/api";

type WordChange = {
  from: string;
  to: string;
  key: string;
};

export default function MyWordsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const next = await getProfile(getUserId());
        if (!cancelled) setProfile(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? "Couldn’t load your words — try again in a moment."
              : "Couldn’t load your words — try again in a moment.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const firstPassRate = useMemo(() => {
    if (!profile || profile.pair_count === 0) return null;
    return Math.round((profile.first_pass_count / profile.pair_count) * 100);
  }, [profile]);

  const corrections = useMemo(() => {
    if (!profile) return [] as WordChange[];
    const seen = new Set<string>();
    const items: WordChange[] = [];
    for (const pair of profile.recent_pairs) {
      const change = firstWordChange(pair.heard, pair.said);
      if (!change || seen.has(change.key)) continue;
      seen.add(change.key);
      items.push(change);
      if (items.length >= 12) break;
    }
    return items;
  }, [profile]);

  const vocabulary = (profile?.vocabulary ?? []).slice(0, 5);

  return (
    <div className="flex h-full min-h-full flex-col px-5 pb-6 pt-5">
      <header className="mb-5 animate-fade-up">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
          Heard
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-ink">
          My Words
        </h1>
      </header>

      {loading && (
        <p className="animate-fade-up text-base text-ink-soft">Loading your words…</p>
      )}

      {!loading && error && (
        <p className="animate-fade-up text-sm font-semibold text-[#6b1530]">{error}</p>
      )}

      {!loading && !error && profile && profile.pair_count === 0 && (
        <section className="animate-fade-up rounded-[1.5rem] bg-white/70 px-4 py-5">
          <p className="text-[18px] font-semibold tracking-tight text-ink">
            Nothing saved yet
          </p>
          <p className="mt-2 text-[14px] font-medium leading-relaxed text-ink-soft">
            Confirm a message in Live or Share and Heard will start building your
            personal word list here.
          </p>
        </section>
      )}

      {!loading && !error && profile && profile.pair_count > 0 && (
        <>
          <section
            className="progress-banner animate-fade-up rounded-[1.5rem] px-4 py-4"
            aria-label="Understanding progress"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-mute">
              Understood first time
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[34px] font-semibold tracking-tight text-ink">
                {firstPassRate ?? 0}%
              </span>
              <span className="text-[14px] font-semibold text-[#4a6bb5]">
                {profile.first_pass_count} of {profile.pair_count} confirms
              </span>
            </p>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink-soft">
              How often Heard’s first guess was already right — from your real confirms,
              not a demo stat.
            </p>
          </section>

          <section className="mt-7 animate-fade-up [animation-delay:60ms]">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
                Your most common words
              </h2>
              <p className="text-[12px] font-semibold tabular-nums text-ink-mute">
                {vocabulary.length}
              </p>
            </div>

            {vocabulary.length === 0 ? (
              <p className="text-[14px] font-medium text-ink-soft">
                Keep confirming short phrases — distinctive words will show up here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {vocabulary.map((word) => (
                  <span key={word} className="word-chip">
                    {word}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8 animate-fade-up [animation-delay:120ms]">
            <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
              Heard as
            </h2>
            {corrections.length === 0 ? (
              <p className="text-[14px] font-medium leading-relaxed text-ink-soft">
                No corrections yet — when you fix a word, it shows up here.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {corrections.map((item) => (
                  <li key={item.key} className="learning-card">
                    <p className="text-[15px] font-semibold leading-snug text-ink">
                      <span>&ldquo;{item.to}&rdquo;</span>
                      <span className="mx-1.5 font-medium text-ink-mute">heard as</span>
                      <span>&ldquo;{item.from}&rdquo;</span>
                    </p>
                    <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#5a5f8a]">
                      We remembered this — next time we’ll get it right sooner.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function stripPunct(word: string): string {
  return word.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "");
}

function norm(word: string): string {
  return stripPunct(word).toLowerCase();
}

/** First word that differs between heard and said — keeps the list scannable. */
function firstWordChange(heard: string, said: string): WordChange | null {
  const a = tokenize(heard);
  const b = tokenize(said);
  if (!a.length || !b.length) return null;

  if (a.length === b.length) {
    for (let i = 0; i < a.length; i++) {
      if (norm(a[i]) !== norm(b[i])) {
        const from = stripPunct(a[i]) || a[i];
        const to = stripPunct(b[i]) || b[i];
        if (!from || !to || from.toLowerCase() === to.toLowerCase()) continue;
        return {
          from,
          to,
          key: `${from.toLowerCase()}→${to.toLowerCase()}`,
        };
      }
    }
    return null;
  }

  const bNorms = new Set(b.map(norm));
  const aNorms = new Set(a.map(norm));
  const onlyHeard = a.find((w) => !bNorms.has(norm(w)));
  const onlySaid = b.find((w) => !aNorms.has(norm(w)));
  if (!onlyHeard || !onlySaid) return null;

  const from = stripPunct(onlyHeard) || onlyHeard;
  const to = stripPunct(onlySaid) || onlySaid;
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return null;
  return {
    from,
    to,
    key: `${from.toLowerCase()}→${to.toLowerCase()}`,
  };
}
