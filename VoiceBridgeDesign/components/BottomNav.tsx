"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/live", label: "Live", tone: "live" },
  { href: "/share", label: "Share", tone: "share" },
  { href: "/my-words", label: "My Words", tone: "data" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="relative z-20 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1"
      aria-label="Main"
    >
      <div className="nav-dock relative rounded-[1.75rem] px-2 py-3">
        <ul className="relative grid grid-cols-3 gap-1">
          {tabs.map(({ href, label, tone }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href} className="flex justify-center">
                <Link
                  href={href}
                  className="group flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-2 rounded-2xl px-1 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-violet/30"
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={`text-[14px] uppercase tracking-[0.14em] transition-colors duration-200 ${
                      active
                        ? "font-bold text-ink"
                        : "font-semibold text-ink-mute group-hover:text-ink-soft"
                    }`}
                  >
                    {label}
                  </span>
                  <span
                    className={`nav-glob nav-glob--${tone} ${
                      active ? "nav-glob--active" : ""
                    }`}
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
