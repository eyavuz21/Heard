/** Flat light-grey field — color lives in the aura globs. */
export function MistBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 bg-[#f2f2f2]"
      aria-hidden
    />
  );
}