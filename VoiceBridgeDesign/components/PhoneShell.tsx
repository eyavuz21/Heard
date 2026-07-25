import { MistBackground } from "@/components/MistBackground";
import { BottomNav } from "@/components/BottomNav";

export function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#e5e5e5] p-3 sm:p-6">
      <div className="relative flex h-[min(844px,100dvh)] w-full max-w-[390px] flex-col overflow-hidden rounded-[2rem] border border-[#dedede] bg-[#f2f2f2] shadow-[0_20px_50px_rgba(0,0,0,0.08)]">
        <MistBackground />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div
            className="flex h-11 shrink-0 items-end justify-center pb-1"
            aria-hidden
          >
            <div className="h-1.5 w-24 rounded-full bg-ink/10" />
          </div>
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </main>
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
