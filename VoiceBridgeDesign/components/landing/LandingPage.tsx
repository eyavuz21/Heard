"use client";

import Link from "next/link";
import { SpeakBlob } from "@/components/ui/SpeakBlob";
import { LandingGlobs } from "@/components/landing/LandingGlobs";
import { StoryScroll } from "@/components/landing/StoryScroll";

export function LandingPage() {
  return (
    <div className="landing-page relative text-ink">
      <LandingGlobs />

      <div className="relative z-10 mx-auto w-full max-w-[430px]">
        <header className="flex items-start justify-between px-6 pb-2 pt-[max(1.4rem,env(safe-area-inset-top))]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-mute animate-fade-up">
            Heard
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-mute animate-fade-up">
            For dysarthria
          </p>
        </header>

        <section className="flex min-h-[85dvh] flex-col items-center justify-center px-6 pb-10 pt-6 text-center">
          <div className="animate-fade-up">
            <SpeakBlob size="hero" mode="idle" aria-label="Heard" />
          </div>
          <h1 className="mt-8 max-w-[16rem] text-[11px] font-bold uppercase tracking-[0.28em] text-ink animate-fade-up [animation-delay:80ms]">
            Be understood
          </h1>
          <p className="mt-4 max-w-[17rem] text-[22px] font-semibold leading-snug tracking-tight text-ink animate-fade-up [animation-delay:140ms]">
            Communication that doesn’t demand perfect speech.
          </p>
          <div className="mt-10 w-full max-w-xs animate-fade-up [animation-delay:220ms]">
            <Link href="/live" className="launch-btn">
              Launch app
            </Link>
          </div>
        </section>

        <StoryScroll />

        <footer className="px-6 pb-[max(2.25rem,env(safe-area-inset-bottom))] pt-6">
          <div className="animate-fade-up">
            <Link href="/live" className="launch-btn">
              Launch app
            </Link>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
              Heard
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
              Designed to listen
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
