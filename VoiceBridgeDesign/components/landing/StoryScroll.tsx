"use client";

import { useEffect, useRef, useState } from "react";
import { storyBeats } from "@/lib/landing-copy";

export function StoryScroll() {
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      // Progress through the section while sticky content is pinned
      const scrollable = Math.max(rect.height - viewport, 1);
      const passed = Math.min(Math.max(-rect.top, 0), scrollable);
      const progress = passed / scrollable;
      const next = Math.min(
        storyBeats.length - 1,
        Math.max(0, Math.floor(progress * storyBeats.length)),
      );
      setActive((prev) => (prev === next ? prev : next));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const beat = storyBeats[active] ?? storyBeats[0];

  return (
    <section
      ref={sectionRef}
      className="story-scroll relative"
      aria-label="About Heard"
      style={{ height: `${storyBeats.length * 100}vh` }}
    >
      <div className="sticky top-0 flex h-dvh flex-col justify-center px-6">
        <div className="relative mx-auto w-full max-w-[22rem]">
          <p
            key={`${beat.id}-eyebrow`}
            className="story-fade text-[10px] font-bold uppercase tracking-[0.24em] text-ink-mute"
          >
            {beat.eyebrow}
          </p>
          <h2
            key={`${beat.id}-title`}
            className="story-fade mt-4 text-[28px] font-semibold leading-[1.15] tracking-tight text-ink"
          >
            {beat.title}
          </h2>
          <p
            key={`${beat.id}-body`}
            className="story-fade mt-4 text-[15px] font-medium leading-relaxed text-ink-soft"
          >
            {beat.body}
          </p>
          {beat.cite ? (
            <p
              key={`${beat.id}-cite`}
              className="story-fade mt-5 text-[11px] font-medium leading-snug text-ink-mute"
            >
              {beat.cite}
            </p>
          ) : null}
        </div>

        <div className="mx-auto mt-8 flex w-full max-w-[22rem] gap-2" aria-hidden>
          {storyBeats.map((b, i) => (
            <span
              key={b.id}
              className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                i === active ? "w-7 bg-violet" : "w-1.5 bg-[#d4d4d4]"
              }`}
            />
          ))}
        </div>

        <p className="mx-auto mt-8 w-full max-w-[22rem] text-[9px] font-semibold uppercase tracking-[0.24em] text-ink-mute">
          Scroll
        </p>
      </div>
    </section>
  );
}
