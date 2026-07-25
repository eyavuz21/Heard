"use client";

type Props = {
  word: string;
  selected?: boolean;
  onClick?: () => void;
};

export function WordChip({ word, selected, onClick }: Props) {
  const interactive = Boolean(onClick);
  const className = `min-h-12 rounded-xl px-3 text-base font-semibold transition ${
    selected
      ? "text-white accent-gradient shadow-sm"
      : "bg-surface-muted text-ink"
  } ${interactive ? "hover:bg-line active:scale-[0.98]" : ""}`;

  if (!interactive) {
    return <span className={`inline-flex items-center ${className}`}>{word}</span>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {word}
    </button>
  );
}
