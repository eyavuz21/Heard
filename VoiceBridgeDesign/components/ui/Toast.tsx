"use client";

type Props = {
  message: string;
  visible: boolean;
};

export function Toast({ message, visible }: Props) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="animate-fade-up absolute left-4 right-4 top-4 z-30 rounded-2xl border border-line bg-white px-4 py-3 text-center text-sm font-semibold text-ink shadow-[0_12px_30px_rgba(0,0,0,0.08)]"
    >
      {message}
    </div>
  );
}
