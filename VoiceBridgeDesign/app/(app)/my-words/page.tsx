"use client";

import { useMemo } from "react";
import {
  stillLearning,
  understoodProgress,
  wordGroups,
} from "@/lib/mock-data";

export default function MyWordsPage() {
  const knownCount = useMemo(
    () => wordGroups.reduce((n, g) => n + g.words.length, 0),
    [],
  );

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

      <section
        className="progress-banner animate-fade-up rounded-[1.5rem] px-4 py-4"
        aria-label="Understanding progress"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-mute">
          Understood first time
        </p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[34px] font-semibold tracking-tight text-ink">
            {understoodProgress.rate}%
          </span>
          <span className="text-[14px] font-semibold text-[#4a6bb5]">
            ↑ {understoodProgress.delta}% {understoodProgress.period}
          </span>
        </p>
        <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink-soft">
          Heard is getting better at understanding you — not the other way
          around.
        </p>
      </section>

      <section className="mt-7 animate-fade-up [animation-delay:60ms]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
            Words I know for you
          </h2>
          <p className="text-[12px] font-semibold tabular-nums text-ink-mute">
            {knownCount}
          </p>
        </div>

        <div className="space-y-5">
          {wordGroups.map((group) => (
            <div key={group.id}>
              <p className="mb-2 text-[12px] font-semibold text-ink-soft">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.words.map((word) => (
                  <span key={word} className="word-chip">
                    {word}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 animate-fade-up [animation-delay:120ms]">
        <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
          Still learning a few
        </h2>
        <ul className="space-y-2.5">
          {stillLearning.map((item) => (
            <li key={item.heard} className="learning-card">
              <p className="text-[15px] font-semibold leading-snug text-ink">
                <span>&ldquo;{item.heard}&rdquo;</span>
                <span className="mx-1.5 font-medium text-ink-mute">
                  — sometimes I hear it as
                </span>
                <span>&ldquo;{item.as}&rdquo;</span>
              </p>
              <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-[#5a5f8a]">
                {item.note}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
