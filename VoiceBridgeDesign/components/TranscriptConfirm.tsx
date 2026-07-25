"use client";

import { ActionGlob } from "@/components/ui/ActionGlob";
import { BigButton } from "@/components/ui/BigButton";
import { WordChip } from "@/components/ui/WordChip";
import { wordAlternatives } from "@/lib/mock-data";

export function alternativesFor(word: string): string[] {
  return wordAlternatives[word] ?? ["…", "Hmm", "Okay"];
}

export function ConfirmView({
  words,
  showWrongActions,
  selectedWordIndex,
  onCorrect,
  onWrong,
  onRerecord,
  onSelectWord,
}: {
  words: string[];
  showWrongActions: boolean;
  selectedWordIndex: number | null;
  onCorrect: () => void;
  onWrong: () => void;
  onRerecord: () => void;
  onSelectWord: (index: number) => void;
}) {
  return (
    <div className="flex flex-1 flex-col animate-fade-up">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
        Is this right?
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-ink">
        Your message
      </p>

      <div className="mt-6 rounded-3xl border border-line bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {words.map((word, i) => (
            <WordChip
              key={`${word}-${i}`}
              word={word}
              selected={selectedWordIndex === i}
              onClick={showWrongActions ? () => onSelectWord(i) : undefined}
            />
          ))}
        </div>
        {showWrongActions && (
          <p className="mt-4 text-sm text-ink-mute">
            Tap a word to fix it, or rerecord.
          </p>
        )}
      </div>

      <div className="mb-8 mt-auto flex items-center justify-center gap-6 pb-4 pt-4">
        {!showWrongActions ? (
          <>
            <ActionGlob label="Correct" tone="correct" onClick={onCorrect} />
            <ActionGlob label="Wrong" tone="wrong" onClick={onWrong} />
          </>
        ) : (
          <>
            <ActionGlob label="Looks good" tone="correct" onClick={onCorrect} />
            <ActionGlob label="Rerecord" tone="wrong" onClick={onRerecord} />
          </>
        )}
      </div>
    </div>
  );
}

export function WordFixView({
  word,
  alternatives,
  onPick,
  onBack,
}: {
  word: string;
  alternatives: string[];
  onPick: (alt: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col animate-fade-up">
      <button
        type="button"
        onClick={onBack}
        className="min-h-12 self-start rounded-xl px-2 text-sm font-semibold text-ink-soft hover:bg-black/5"
      >
        ← Back
      </button>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
        Replace word
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
        &ldquo;{word}&rdquo;
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Tap what you meant — no typing needed.
      </p>

      <div className="mt-8 flex gap-3 overflow-x-auto pb-2">
        {alternatives.map((alt) => (
          <button
            key={alt}
            type="button"
            onClick={() => onPick(alt)}
            className="min-h-16 shrink-0 rounded-2xl border border-line bg-white px-6 text-lg font-semibold text-ink transition hover:bg-surface-muted active:scale-[0.98]"
          >
            {alt}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <BigButton variant="ghost" onClick={onBack}>
          Keep &ldquo;{word}&rdquo;
        </BigButton>
      </div>
    </div>
  );
}
