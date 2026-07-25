"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "success" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "accent-gradient text-white shadow-[0_10px_28px_rgba(107,77,255,0.28)] hover:brightness-105",
  secondary:
    "bg-white text-ink border border-line hover:bg-surface-muted",
  success: "bg-success text-white hover:brightness-105",
  danger: "bg-danger text-white hover:brightness-105",
  ghost: "bg-transparent text-ink-soft hover:bg-black/5",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
};

export function BigButton({
  variant = "primary",
  fullWidth = true,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 font-body text-base font-semibold tracking-wide transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
        fullWidth ? "w-full" : ""
      } ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
