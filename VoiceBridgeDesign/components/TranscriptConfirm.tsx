"use client";

import { ActionGlob } from "@/components/ui/ActionGlob";
import { BigButton } from "@/components/ui/BigButton";
import { WordChip } from "@/components/ui/WordChip";
import type { WordOption } from "@/lib/api";

export function ConfirmView({
  best,
  words,
  confidence,
  needsConfirmation,
  alternates,
  showWrongActions,
  selectedWordIndex,
  errorMessage,
  isSpeaking,
  onCorrect,
  onWrong,
  onRerecord,
  onSelectWord,
  onPickSentence,
}: {
  best: string;
  words: WordOption[];
  confidence: number;
  needsConfirmation: boolean;
  alternates: string[];
  showWrongActions: boolean;
  selectedWordIndex: number | null;
  errorMessage?: string | null;
  isSpeaking?: boolean;
  onCorrect: () => void | Promise<void>;
  onWrong: () => void;
  onRerecord: () => void;
  onSelectWord: (index: number) => void;
  onPickSentence?: (sentence: string) => void;
}) {
  const refused = !best.trim();
  const heading = refused
    ? "Try again"
    : needsConfirmation
      ? "I'm not sure"
      : "Your message";

  return (
    <div className="flex flex-1 flex-col animate-fade-up">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
        {refused ? "I couldn't make that out" : "Is this right?"}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-ink">
        {heading}
      </p>
      {!refused && (
        <p className="mt-2 text-sm text-ink-mute">
          Confidence {Math.round(confidence * 100)}%
        </p>
      )}

      <div className="mt-6 rounded-3xl border border-line bg-white p-4">
        {refused ? (
          <p className="text-base leading-relaxed text-ink-soft">
            I couldn&apos;t make that out — try again.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {words.map((option, i) => (
              <WordChip
                key={`${option.word}-${i}`}
                word={option.word}
                agreement={option.agreement}
                selected={selectedWordIndex === i}
                onClick={showWrongActions ? () => onSelectWord(i) : undefined}
              />
            ))}
          </div>
        )}
        {!refused && showWrongActions && (
          <p className="mt-4 text-sm text-ink-mute">
            Tap a word to fix it, or rerecord.
          </p>
        )}
        {!refused && needsConfirmation && alternates.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-mute">
              Maybe
            </p>
            {alternates.map((sentence) => (
              <button
                key={sentence}
                type="button"
                onClick={() => onPickSentence?.(sentence)}
                className="block w-full rounded-2xl border border-line bg-surface-muted px-4 py-3 text-left text-sm font-semibold text-ink transition hover:bg-line active:scale-[0.98]"
              >
                {sentence}
              </button>
            ))}
          </div>
        )}
        {errorMessage && (
          <p className="mt-4 text-sm font-semibold text-[#6b1530]">{errorMessage}</p>
        )}
      </div>

      <div className="mb-8 mt-auto flex items-center justify-center gap-6 pb-4 pt-4">
        {refused ? (
          <ActionGlob label="Rerecord" tone="wrong" onClick={onRerecord} />
        ) : isSpeaking ? (
          <ActionGlob label="Speaking" tone="correct" onClick={() => undefined} />
        ) : !showWrongActions ? (
          <>
            <ActionGlob label="Correct" tone="correct" onClick={() => void onCorrect()} />
            <ActionGlob label="Wrong" tone="wrong" onClick={onWrong} />
          </>
        ) : (
          <>
            <ActionGlob label="Looks good" tone="correct" onClick={() => void onCorrect()} />
            <ActionGlob label="Rerecord" tone="wrong" onClick={onRerecord} />
          </>
        )}
      </div>
    </div>
  );
}

export function WordFixView({
  option,
  alternatives,
  onPick,
  onBack,
}: {
  option: WordOption;
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
        &ldquo;{option.word}&rdquo;
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
          Keep &ldquo;{option.word}&rdquo;
        </BigButton>
      </div>
    </div>
  );
}
