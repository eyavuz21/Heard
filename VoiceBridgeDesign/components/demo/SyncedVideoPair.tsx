"use client";

import { useEffect, useRef } from "react";
import { DemoVideoSlot } from "@/components/demo/DemoVideoSlot";
import type { DemoPanel } from "@/lib/demo-slides";

const DRIFT_SEC = 0.12;

type SyncedVideoPairProps = {
  left: DemoPanel;
  right: DemoPanel;
  /** When false, both videos pause (e.g. user scrolled off this slide). */
  active?: boolean;
};

/**
 * Two videos that stay locked: play, pause, seek, and rate changes on either
 * side are mirrored to the other. Drift is corrected while playing.
 */
export function SyncedVideoPair({
  left,
  right,
  active = true,
}: SyncedVideoPairProps) {
  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const a = leftRef.current;
    const b = rightRef.current;
    if (!a || !b) return;

    const withSyncLock = (fn: () => void) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        fn();
      } finally {
        requestAnimationFrame(() => {
          syncingRef.current = false;
        });
      }
    };

    const bind = (source: HTMLVideoElement, target: HTMLVideoElement) => {
      const onPlay = () => {
        withSyncLock(() => {
          if (target.paused) void target.play().catch(() => undefined);
        });
      };
      const onPause = () => {
        withSyncLock(() => {
          if (!target.paused) target.pause();
        });
      };
      const onSeek = () => {
        withSyncLock(() => {
          if (Math.abs(target.currentTime - source.currentTime) > 0.03) {
            target.currentTime = source.currentTime;
          }
        });
      };
      const onRate = () => {
        withSyncLock(() => {
          if (target.playbackRate !== source.playbackRate) {
            target.playbackRate = source.playbackRate;
          }
        });
      };
      const onTimeUpdate = () => {
        if (syncingRef.current || source.paused) return;
        if (Math.abs(target.currentTime - source.currentTime) > DRIFT_SEC) {
          withSyncLock(() => {
            target.currentTime = source.currentTime;
            if (source.paused !== target.paused) {
              if (source.paused) target.pause();
              else void target.play().catch(() => undefined);
            }
          });
        }
      };

      source.addEventListener("play", onPlay);
      source.addEventListener("pause", onPause);
      source.addEventListener("seeking", onSeek);
      source.addEventListener("seeked", onSeek);
      source.addEventListener("ratechange", onRate);
      source.addEventListener("timeupdate", onTimeUpdate);

      return () => {
        source.removeEventListener("play", onPlay);
        source.removeEventListener("pause", onPause);
        source.removeEventListener("seeking", onSeek);
        source.removeEventListener("seeked", onSeek);
        source.removeEventListener("ratechange", onRate);
        source.removeEventListener("timeupdate", onTimeUpdate);
      };
    };

    const unbindA = bind(a, b);
    const unbindB = bind(b, a);
    return () => {
      unbindA();
      unbindB();
    };
  }, [left.src, right.src]);

  useEffect(() => {
    const a = leftRef.current;
    const b = rightRef.current;
    if (!a || !b) return;

    if (!active) {
      syncingRef.current = true;
      a.pause();
      b.pause();
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
      return;
    }

    let cancelled = false;

    const whenCanPlay = (video: HTMLVideoElement) =>
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            const done = () => resolve();
            video.addEventListener("canplay", done, { once: true });
            video.addEventListener("loadeddata", done, { once: true });
          });

    async function startTogether() {
      await Promise.all([whenCanPlay(a), whenCanPlay(b)]);
      if (cancelled) return;

      syncingRef.current = true;
      try {
        a.currentTime = 0;
        b.currentTime = 0;
        // Muted side almost always starts; speaker may need a prior gesture (scroll often counts).
        await Promise.allSettled([b.play(), a.play()]);
        if (a.paused && !b.paused) {
          // Keep them locked even if audio autoplay was blocked.
          a.muted = true;
          await a.play().catch(() => undefined);
        }
      } finally {
        requestAnimationFrame(() => {
          syncingRef.current = false;
        });
      }
    }

    void startTogether();

    return () => {
      cancelled = true;
    };
  }, [active, left.src, right.src]);

  return (
    <div className="story-fade mx-auto mt-7 flex w-full max-w-4xl flex-col items-stretch gap-5 sm:mt-8 sm:flex-row sm:items-start sm:gap-8">
      <DemoVideoSlot
        label={left.label}
        caption={left.caption}
        src={left.src}
        side="left"
        videoRef={leftRef}
        muted={left.muted ?? false}
      />
      <DemoVideoSlot
        label={right.label}
        caption={right.caption}
        src={right.src}
        side="right"
        videoRef={rightRef}
        muted={right.muted ?? false}
      />
    </div>
  );
}
