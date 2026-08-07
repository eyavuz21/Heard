"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LandingGlobs } from "@/components/landing/LandingGlobs";
import { DemoVideoSlot } from "@/components/demo/DemoVideoSlot";
import { DemoTechPoints } from "@/components/demo/DemoTechPoints";
import { SyncedVideoPair } from "@/components/demo/SyncedVideoPair";
import { demoSlides, type DemoSlide } from "@/lib/demo-slides";

function SlideBody({
  slide,
  active,
}: {
  slide: DemoSlide;
  active: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col justify-center px-1">
      <div
        className={`mx-auto w-full text-center ${
          slide.kind === "story" ? "max-w-xl" : "max-w-2xl"
        }`}
      >
        <p
          key={`${slide.id}-eyebrow`}
          className="story-fade text-[10px] font-bold uppercase tracking-[0.28em] text-ink-mute"
        >
          {slide.eyebrow}
        </p>
        <h1
          key={`${slide.id}-title`}
          className={`story-fade mt-3 font-semibold leading-tight tracking-tight text-ink ${
            slide.kind === "story"
              ? "text-[clamp(2.4rem,8vw,4.5rem)]"
              : "text-[clamp(1.5rem,3.2vw,2.2rem)]"
          }`}
        >
          {slide.title}
        </h1>
        <p
          key={`${slide.id}-body`}
          className="story-fade mx-auto mt-3 max-w-xl text-[15px] font-medium leading-relaxed text-ink-soft md:text-base"
        >
          {slide.body}
        </p>
        {slide.kind === "story" && slide.cite ? (
          <p
            key={`${slide.id}-cite`}
            className="story-fade mx-auto mt-5 max-w-md text-[11px] font-medium leading-snug text-ink-mute"
          >
            {slide.cite}
          </p>
        ) : null}
      </div>

      {slide.kind === "video" && slide.sync ? (
        <SyncedVideoPair
          key={`${slide.id}-synced`}
          left={slide.left}
          right={slide.right}
          active={active}
        />
      ) : null}

      {slide.kind === "video" && !slide.sync ? (
        <div
          key={`${slide.id}-videos`}
          className="story-fade mx-auto mt-7 flex w-full max-w-4xl flex-col items-stretch gap-5 sm:mt-8 sm:flex-row sm:items-start sm:gap-8"
        >
          <DemoVideoSlot
            label={slide.left.label}
            caption={slide.left.caption}
            src={slide.left.src}
            media={slide.left.media}
            side="left"
          />
          <DemoVideoSlot
            label={slide.right.label}
            caption={slide.right.caption}
            src={slide.right.src}
            media={slide.right.media}
            side="right"
          />
        </div>
      ) : null}

      {slide.kind === "tech" ? (
        <div key={`${slide.id}-tech`} className="story-fade">
          <DemoTechPoints points={slide.points} />
        </div>
      ) : null}
    </div>
  );
}

export function DemoDeck() {
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const total = demoSlides.length;
  const slide = demoSlides[active] ?? demoSlides[0];

  const scrollToSlide = useCallback((index: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const next = ((index % total) + total) % total;
    const rect = section.getBoundingClientRect();
    const absoluteTop = window.scrollY + rect.top;
    const scrollable = Math.max(rect.height - window.innerHeight, 1);
    const target = absoluteTop + (next / total) * scrollable + 1;
    window.scrollTo({ top: target, behavior: "smooth" });
  }, [total]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const scrollable = Math.max(rect.height - viewport, 1);
      const passed = Math.min(Math.max(-rect.top, 0), scrollable);
      const progress = passed / scrollable;
      const next = Math.min(
        total - 1,
        Math.max(0, Math.floor(progress * total)),
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
  }, [total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        scrollToSlide(active + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        scrollToSlide(active - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, scrollToSlide]);

  return (
    <div className="demo-page relative text-ink">
      <div
        className="demo-aura pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <LandingGlobs />
      </div>

      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between px-6 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-10">
        <div className="pointer-events-auto">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-mute">
            Heard
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
            Demo
          </p>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
            {String(active + 1).padStart(2, "0")} /{" "}
            {String(total).padStart(2, "0")}
          </p>
          <Link
            href="/"
            className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute transition-colors hover:text-ink"
          >
            Home
          </Link>
        </div>
      </header>

      <section
        ref={sectionRef}
        className="relative z-10"
        aria-label="Heard demo"
        style={{ height: `${total * 100}vh` }}
      >
        <div className="sticky top-0 flex h-dvh flex-col px-6 pb-8 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] md:px-10">
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
            <SlideBody slide={slide} active />
          </div>

          <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center gap-5">
            <div className="flex w-full items-center gap-4">
              <button
                type="button"
                className="demo-nav-text"
                onClick={() => scrollToSlide(active - 1)}
                aria-label="Previous slide"
                disabled={active === 0}
              >
                ←
              </button>

              <div className="flex min-w-0 flex-1 justify-center gap-1.5">
                {demoSlides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Go to ${s.eyebrow}`}
                    onClick={() => scrollToSlide(i)}
                    className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                      i === active
                        ? "w-7 bg-violet"
                        : "w-1.5 bg-[#d4d4d4] hover:bg-[#bdbdbd]"
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                className="demo-nav-text"
                onClick={() => scrollToSlide(active + 1)}
                aria-label="Next slide"
                disabled={active === total - 1}
              >
                →
              </button>
            </div>

            <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-ink-mute">
              Scroll
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
