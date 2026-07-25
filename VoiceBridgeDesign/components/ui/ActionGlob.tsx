"use client";

type Tone = "correct" | "wrong";

type Props = {
  label: string;
  tone: Tone;
  onClick: () => void;
  "aria-label"?: string;
};

export function ActionGlob({
  label,
  tone,
  onClick,
  "aria-label": ariaLabel,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={`action-outline action-outline--${tone} outline-none transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2`}
    >
      <span className="action-outline-glob" aria-hidden />
      <span className="action-outline-label">{label}</span>
    </button>
  );
}
