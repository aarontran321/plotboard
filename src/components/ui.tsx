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
 * a hairline border). Dropdowns and text inputs drop the fully-boxed chrome
 * for a minimal underline, so the workspace reads as controls floating over
 * the field rather than a form.
 *
 * Buttons follow a strict 3-tier hierarchy, deliberately: exactly one button
 * anywhere on screen at a time may claim Tier 1 (`variant="primary"` — a
 * solid accent block). Everything else is Tier 2 (`variant="default"` — a
 * thin outline that fades to slate on hover) or Tier 3 (`variant="danger"` —
 * a muted outline that only turns vibrant red on hover, for destructive
 * actions that shouldn't scream at rest). A toggled-on state (`active`) is
 * neither: it's a ring-and-matte treatment in the same sky/blue accent
 * family, so "this mode is on" reads distinctly from "click this to act."
 * No neon green anywhere — it fought with the turf.
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
    "transition-all duration-200 ease-in-out " +
    "disabled:opacity-40 disabled:cursor-not-allowed " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";

  // A toggled-on mode reads as "this is active", not "click me" — a matte
  // fill with a glowing accent ring, kept deliberately distinct from Tier 1's
  // solid block so the two never compete for the same visual weight.
  const palette = active
    ? "border-sky-400/50 bg-slate-800/90 text-white ring-2 ring-sky-400/70 ring-offset-2 ring-offset-[#0a0e17] " +
      "shadow-[0_0_16px_rgba(56,189,248,0.28)]"
    : variant === "primary"
      ? // Tier 1 — reserved for exactly one button at a time anywhere on screen.
        "border-sky-400/40 bg-sky-500 text-white shadow-[0_4px_14px_-2px_rgba(14,165,233,0.45)] " +
        "enabled:hover:bg-sky-400 enabled:hover:shadow-[0_4px_20px_-2px_rgba(14,165,233,0.65)]"
      : variant === "danger"
        ? // Tier 3 — muted at rest, only turns vibrant on hover/confirmation.
          "border-rose-900/50 bg-transparent text-rose-400/75 " +
          "enabled:hover:border-rose-500 enabled:hover:bg-rose-950/30 enabled:hover:text-rose-300"
        : // Tier 2 — the default for everything else: an outline that fades
          // to slate on hover, never competing with Tier 1 for attention.
          "border-slate-700 bg-transparent text-[#CBD5E1] " +
          "enabled:hover:bg-slate-800/60 enabled:hover:border-slate-600";

  return <button className={`${base} ${palette} ${className}`} {...props} />;
}

/** A single option within a `Segmented` control. */
export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * A compact segmented control for a small fixed set of choices (2-3), so the
 * user can tap directly to the option they want instead of opening a
 * dropdown. The active segment gets Tier 1's solid accent fill; the rest sit
 * flush and transparent until hovered.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex w-full gap-0.5 rounded-lg border border-white/[0.07] bg-[#0F172A]/60 p-1"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={
              "flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-all duration-200 ease-in-out " +
              "disabled:cursor-not-allowed disabled:opacity-40 " +
              (isActive
                ? "bg-sky-500 text-white shadow-[0_2px_8px_-1px_rgba(14,165,233,0.5)]"
                : "text-[#7C8AA5] enabled:hover:bg-white/[0.05] enabled:hover:text-[#E5E7EB]")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
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
        "w-full cursor-pointer appearance-none border-0 border-b-[1.5px] border-slate-700/50 bg-transparent " +
        "px-0.5 py-2 pr-6 text-[13px] font-medium text-[#E5E7EB] transition-all duration-200 ease-in-out " +
        "hover:enabled:border-slate-500/70 focus:border-b-2 focus:border-sky-400 focus:outline-none " +
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
          "w-full min-w-0 border-0 border-b-[1.5px] border-slate-700/50 bg-transparent px-0.5 py-2 " +
          "text-[13px] text-[#E5E7EB] transition-all duration-200 ease-in-out placeholder:text-[#4B5875] " +
          "hover:enabled:border-slate-500/70 focus:border-b-2 focus:border-sky-400 focus:outline-none " +
          "disabled:cursor-not-allowed disabled:opacity-40 " +
          className
        }
        {...props}
      />
    );
  }
);

/**
 * A small square icon button showing a chevron/arrow glyph («, », ⌄), used to
 * collapse or re-expand a panel. Kept as a plain glyph rather than an SVG —
 * these four characters read clearly at 12px and need no path data.
 */
export function CollapseButton({
  glyph,
  label,
  onClick,
  className = "",
}: {
  glyph: string;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border " +
        "border-white/[0.08] bg-[#0F172A]/80 text-[12px] font-bold text-[#7C8AA5] " +
        "transition-colors hover:bg-white/[0.08] hover:text-[#E5E7EB] " +
        className
      }
    >
      {glyph}
    </button>
  );
}

/** A small, softly elevated value chip. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/[0.08] bg-[#0F172A]/80 px-2.5 py-0.5 font-mono text-[12px] text-[#7DD3FC] shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
      {children}
    </span>
  );
}
