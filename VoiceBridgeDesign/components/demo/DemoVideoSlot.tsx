"use client";

type DemoVideoSlotProps = {
  label: string;
  caption?: string;
  src: string | null;
  side: "left" | "right";
};

export function DemoVideoSlot({
  label,
  caption,
  src,
  side,
}: DemoVideoSlotProps) {
  return (
    <figure className="demo-panel flex min-w-0 flex-1 flex-col">
      <div
        className={`demo-video-frame relative aspect-[9/16] w-full overflow-hidden ${
          side === "left" ? "demo-video-frame--cool" : "demo-video-frame--warm"
        }`}
      >
        {src ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={src}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span
              className={`demo-slot-glob ${
                side === "left" ? "demo-slot-glob--cool" : "demo-slot-glob--warm"
              }`}
              aria-hidden
            />
            <p className="relative z-[1] text-[10px] font-bold uppercase tracking-[0.22em] text-ink-mute">
              Video soon
            </p>
            <p className="relative z-[1] max-w-[12rem] text-[13px] font-medium leading-snug text-ink-soft">
              Drop a file in{" "}
              <span className="font-semibold text-ink">public/demo/</span> and
              set <span className="font-semibold text-ink">src</span> on this
              slide.
            </p>
          </div>
        )}
      </div>
      <figcaption className="mt-4 px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink">
          {label}
        </p>
        {caption ? (
          <p className="mt-1.5 text-[14px] font-medium leading-snug text-ink-soft">
            {caption}
          </p>
        ) : null}
      </figcaption>
    </figure>
  );
}
