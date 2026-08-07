"use client";

import type { Ref } from "react";
import type { DemoPanel } from "@/lib/demo-slides";

type DemoVideoSlotProps = {
  label: string;
  caption?: string;
  src: string | null;
  side: "left" | "right";
  media?: DemoPanel["media"];
  videoRef?: Ref<HTMLVideoElement>;
  /** Useful when pairing with another clip that carries the audio. */
  muted?: boolean;
};

export function DemoVideoSlot({
  label,
  caption,
  src,
  side,
  media = "video",
  videoRef,
  muted = false,
}: DemoVideoSlotProps) {
  const tone = side === "left" ? "cool" : "warm";
  const isImage = media === "image";

  return (
    <figure className="demo-panel flex min-w-0 flex-1 flex-col">
      <div
        className={`demo-video-frame relative aspect-[9/16] w-full overflow-hidden demo-video-frame--${tone}`}
      >
        {/* Soft aura matte behind letterboxing — keeps both slots the same size */}
        <span
          className={`demo-video-matte demo-video-matte--${tone}`}
          aria-hidden
        />

        {src && isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- local demo assets, avoid next/image config churn
          <img
            className="demo-video"
            src={src}
            alt={caption ? `${label}: ${caption}` : label}
          />
        ) : null}

        {src && !isImage ? (
          <video
            ref={videoRef}
            className="demo-video"
            src={src}
            controls
            playsInline
            preload="auto"
            muted={muted}
            controlsList="nodownload"
          />
        ) : null}

        {!src ? (
          <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink-mute">
              {isImage ? "Image soon" : "Video soon"}
            </p>
            <p className="max-w-[12rem] text-[13px] font-medium leading-snug text-ink-soft">
              Drop a file in{" "}
              <span className="font-semibold text-ink">public/demo/</span> and
              set <span className="font-semibold text-ink">src</span> on this
              slide.
            </p>
          </div>
        ) : null}
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
