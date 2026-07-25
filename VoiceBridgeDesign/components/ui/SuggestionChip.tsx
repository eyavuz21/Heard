"use client";

type Props = {
  label: string;
  selected?: boolean;
  onClick?: () => void;
};

export function SuggestionChip({ label, selected, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 rounded-full border px-4 text-sm font-semibold transition active:scale-[0.98] ${
        selected
          ? "border-transparent text-white accent-gradient shadow-[0_8px_20px_rgba(107,77,255,0.25)]"
          : "border-line bg-white text-ink-soft hover:bg-surface-muted"
      }`}
    >
      {label}
    </button>
  );
}
