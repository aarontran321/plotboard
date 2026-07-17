"use client";

import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

/**
 * "Tactile / Elevated Dark Mode" UI primitives.
 *
 * Panels sit a step lighter than the page background and read as physically
 * raised, frosted-glass surfaces (translucent fill + blur + soft shadow +
 * a hairline border). Buttons carry a subtle gradient and lift/glow on
 * hover; toggled-on state uses a vibrant accent rather than a plain fill.
 * Dropdowns and text inputs drop the fully-boxed chrome for a minimal
 * underline, so the workspace reads as controls floating over the field
 * rather than a form.
 */

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={
        "flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-[#111827]/70 p-4 " +
        "shadow-[0_12px_36px_-8px_rgba(0,0,0,0.55)] backdrop-blur-xl " +
        className
      }
    >
      {children}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={`shrink-0 text-[#64748B] transition-transform duration-150 ${open ? "rotate-0" : "-rotate-90"}`}
    >
      <path d="M1.5 3.5L5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A collapsible panel section. Defaults open, so nothing collapses by
 * surprise; the chevron and header are the whole toggle target, keeping the
 * long vertical stack of controls condensable without extra chrome.
 */
export function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-2 text-left select-none"
      >
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[#7C8AA5] uppercase">{title}</h2>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="animate-accordion-in flex flex-col gap-2.5">{children}</div>}
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  variant?: "default" | "primary" | "danger";
};

export function Button({
  active = false,
  variant = "default",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "rounded-lg px-3 py-2 text-[13px] font-medium border select-none cursor-pointer " +
    "transition-[transform,box-shadow,background-color,border-color] duration-150 " +
    "enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:hover:scale-[1.02] " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38BDF8]";

  const palette = active
    ? "border-emerald-400/50 bg-gradient-to-b from-emerald-400 to-emerald-600 text-white " +
      "shadow-[0_0_0_1px_rgba(52,211,153,0.25),0_0_18px_rgba(16,185,129,0.45)]"
    : variant === "primary"
      ? "border-sky-400/40 bg-gradient-to-b from-sky-400 to-blue-600 text-white " +
        "shadow-[0_4px_14px_-2px_rgba(14,165,233,0.5)] enabled:hover:shadow-[0_4px_20px_-2px_rgba(14,165,233,0.7)]"
      : variant === "danger"
        ? "border-rose-500/30 bg-gradient-to-b from-[#3A1F27] to-[#2A161C] text-[#FCA5A5] " +
          "enabled:hover:from-[#47232C] enabled:hover:to-[#331A21] enabled:hover:shadow-[0_0_14px_rgba(244,63,94,0.25)]"
        : "border-white/[0.08] bg-gradient-to-b from-[#232E45] to-[#1A2336] text-[#E5E7EB] " +
          "enabled:hover:from-[#2B3752] enabled:hover:to-[#202B42] enabled:hover:border-white/[0.14]";

  return <button className={`${base} ${palette} ${className}`} {...props} />;
}

/**
 * An underline dropdown: no enclosing box, just a bottom hairline that glows
 * into the accent colour on focus. The native `<select>` is kept — free
 * accessibility and correct touch behaviour — with only its chrome restyled.
 */
export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const caret =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%2364748B" stroke-width="1.5"/></svg>`
    );

  return (
    <select
      className={
        "w-full cursor-pointer appearance-none border-0 border-b-[1.5px] border-[#2A3550] bg-transparent " +
        "px-0.5 py-2 pr-6 text-[13px] font-medium text-[#E5E7EB] transition-colors duration-150 " +
        "hover:enabled:border-[#3E4A6B] focus:border-[#38BDF8] focus:outline-none " +
        "disabled:cursor-not-allowed disabled:opacity-40 " +
        className
      }
      style={{
        backgroundImage: `url("${caret}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.15rem center",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

/** A minimal underline text input, matching `Select`'s treatment. */
export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={
          "w-full min-w-0 border-0 border-b-[1.5px] border-[#2A3550] bg-transparent px-0.5 py-2 " +
          "text-[13px] text-[#E5E7EB] transition-colors duration-150 placeholder:text-[#4B5875] " +
          "hover:enabled:border-[#3E4A6B] focus:border-[#38BDF8] focus:outline-none " +
          "disabled:cursor-not-allowed disabled:opacity-40 " +
          className
        }
        {...props}
      />
    );
  }
);

/** A small, softly elevated value chip. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/[0.08] bg-[#0F172A]/80 px-2.5 py-0.5 font-mono text-[12px] text-[#7DD3FC] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
      {children}
    </span>
  );
}
