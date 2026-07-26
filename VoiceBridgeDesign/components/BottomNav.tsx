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
      className="relative z-20 px-4 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1.75rem))] pt-2"
      aria-label="Main"
    >
      <div className="nav-dock relative px-3 py-5">
        <ul className="relative grid grid-cols-3 gap-3">
          {tabs.map(({ href, label, tone }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href} className="flex justify-center">
                <Link
                  href={href}
                  className="group flex w-full flex-col items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-violet/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={`nav-tab-label ${
                      active ? "nav-tab-label--active" : ""
                    }`}
                  >
                    {label}
                  </span>
                  <span className="nav-glob-slot">
                    <span
                      className={`nav-glob-ring ${
                        active ? "nav-glob-ring--active" : ""
                      }`}
                      aria-hidden
                    />
                    <span
                      className={`nav-glob-scale ${
                        active ? "nav-glob-scale--active" : ""
                      }`}
                    >
                      <span
                        className={`nav-glob nav-glob--${tone} ${
                          active ? "nav-glob--active" : ""
                        }`}
                        aria-hidden
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
