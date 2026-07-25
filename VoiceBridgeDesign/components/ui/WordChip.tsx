"use client";

type Props = {
  word: string;
  selected?: boolean;
  agreement?: number;
  onClick?: () => void;
};

export function WordChip({ word, selected, agreement = 1, onClick }: Props) {
  const interactive = Boolean(onClick);
  const uncertain =
    agreement < 0.67
      ? "bg-[#ffe8ee] text-[#6b1530]"
      : agreement < 1
        ? "bg-[#fff3d7] text-[#4b3513]"
        : "bg-surface-muted text-ink";
  const className = `min-h-12 rounded-xl px-3 text-base font-semibold transition ${
    selected
      ? "text-white accent-gradient shadow-sm"
      : uncertain
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
