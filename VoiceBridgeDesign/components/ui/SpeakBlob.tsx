"use client";

type Props = {
  onClick?: () => void;
  label?: string;
  caption?: string;
  mode?: "speak" | "recording" | "idle";
  size?: "md" | "lg" | "hero";
  "aria-label": string;
};

export function SpeakBlob({
  onClick,
  label,
  caption,
  mode = "speak",
  size = "md",
  "aria-label": ariaLabel,
}: Props) {
  const sizeClass =
    size === "hero"
      ? "speak-blob--hero"
      : size === "lg"
        ? "speak-blob--lg"
        : "";

  const className = `speak-blob ${sizeClass} ${
    mode === "recording" ? "speak-blob--recording" : ""
  }`;

  const isLoadingDots = label === "…" || label === "...";

  const inner = (
    <>
      <span className="speak-blob-field" aria-hidden>
        <span className="speak-blob-cloud speak-blob-cloud-a" />
        <span className="speak-blob-cloud speak-blob-cloud-b" />
        <span className="speak-blob-cloud speak-blob-cloud-c" />
        <span className="speak-blob-cloud speak-blob-cloud-d" />
      </span>
      {mode === "recording" ? (
        <span className="speak-blob-stop" />
      ) : isLoadingDots ? (
        <span className="speak-blob-dots" aria-hidden>
          <span className="speak-blob-dot" />
          <span className="speak-blob-dot" />
          <span className="speak-blob-dot" />
        </span>
      ) : label ? (
        <span className="speak-blob-label">{label}</span>
      ) : null}
    </>
  );

  const control = !onClick ? (
    <div className={className} role="status" aria-label={ariaLabel}>
      {inner}
    </div>
  ) : (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
    >
      {inner}
    </button>
  );

  if (!caption) return control;

  return (
    <div className="flex flex-col items-center gap-5">
      {control}
      <p className="max-w-[14rem] text-center text-[14px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {caption}
      </p>
    </div>
  );
}
