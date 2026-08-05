"use client";

import { useEffect, useRef } from "react";
import { DemoVideoSlot } from "@/components/demo/DemoVideoSlot";
import type { DemoPanel } from "@/lib/demo-slides";

/** Only hard-seek when drift is clearly out of sync (buffering noise is smaller). */
const DRIFT_SEC = 0.45;
/** Minimum gap between automatic drift seeks so buffering can't thrash. */
const DRIFT_COOLDOWN_MS = 1500;

type SyncedVideoPairProps = {
  left: DemoPanel;
  right: DemoPanel;
  /** When false, both videos pause (e.g. user scrolled off this slide). */
  active?: boolean;
};

function isBuffering(video: HTMLVideoElement) {
  return video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
}

/**
 * Two videos that stay locked: play, pause, seek, and rate changes on either
 * side are mirrored to the other. Drift correction is soft — skipped while
 * either side is buffering, and rate-limited so network stalls don't thrash.
 */
export function SyncedVideoPair({
  left,
  right,
  active = true,
}: SyncedVideoPairProps) {
  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);
  const syncingRef = useRef(false);
  const lastDriftSeekRef = useRef(0);

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

    const bindControls = (
      source: HTMLVideoElement,
      target: HTMLVideoElement,
    ) => {
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
        if (isBuffering(source) || isBuffering(target)) return;
        withSyncLock(() => {
          const t = Math.min(
            source.currentTime,
            Number.isFinite(target.duration) ? target.duration : source.currentTime,
          );
          if (Math.abs(target.currentTime - t) > 0.05) {
            target.currentTime = t;
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

      source.addEventListener("play", onPlay);
      source.addEventListener("pause", onPause);
      source.addEventListener("seeked", onSeek);
      source.addEventListener("ratechange", onRate);

      return () => {
        source.removeEventListener("play", onPlay);
        source.removeEventListener("pause", onPause);
        source.removeEventListener("seeked", onSeek);
        source.removeEventListener("ratechange", onRate);
      };
    };

    // Drift: left leads only — avoids mutual seek thrash.
    const onLeaderTimeUpdate = () => {
      if (syncingRef.current || a.paused) return;
      if (isBuffering(a) || isBuffering(b)) return;

      const maxT = Math.min(
        Number.isFinite(a.duration) ? a.duration : Infinity,
        Number.isFinite(b.duration) ? b.duration : Infinity,
      );
      if (!Number.isFinite(maxT) || maxT <= 0) return;

      const leaderT = Math.min(a.currentTime, maxT);
      if (Math.abs(b.currentTime - leaderT) <= DRIFT_SEC) return;

      const now = performance.now();
      if (now - lastDriftSeekRef.current < DRIFT_COOLDOWN_MS) return;
      lastDriftSeekRef.current = now;

      withSyncLock(() => {
        b.currentTime = leaderT;
        if (a.paused !== b.paused) {
          if (a.paused) b.pause();
          else void b.play().catch(() => undefined);
        }
      });
    };

    const unbindA = bindControls(a, b);
    const unbindB = bindControls(b, a);
    a.addEventListener("timeupdate", onLeaderTimeUpdate);

    return () => {
      unbindA();
      unbindB();
      a.removeEventListener("timeupdate", onLeaderTimeUpdate);
    };
  }, [left.src, right.src]);

  useEffect(() => {
    const leftEl = leftRef.current;
    const rightEl = rightRef.current;
    if (!leftEl || !rightEl) return;
    const a: HTMLVideoElement = leftEl;
    const b: HTMLVideoElement = rightEl;

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
        await Promise.allSettled([b.play(), a.play()]);
        if (a.paused && !b.paused) {
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
