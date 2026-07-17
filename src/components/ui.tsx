"use client";

import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Flat UI primitives.
 *
 * Every surface here is a solid fill with a 1px border. No shadows, no glows,
 * no gradients — depth is communicated with border and background steps only.
 */

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-5 border border-[#1F2937] bg-[#111827] p-4 ${className}`}>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
        {title}
      </h2>
      {children}
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
    "px-3 py-2 text-[13px] font-medium border transition-colors select-none " +
    "disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]";

  const palette = active
    ? "bg-[#1D4ED8] border-[#3B82F6] text-white"
    : variant === "primary"
      ? "bg-[#2563EB] border-[#3B82F6] text-white enabled:hover:bg-[#1D4ED8]"
      : variant === "danger"
        ? "bg-[#1F2937] border-[#4B5563] text-[#FCA5A5] enabled:hover:bg-[#374151]"
        : "bg-[#1F2937] border-[#374151] text-[#E5E7EB] enabled:hover:bg-[#374151]";

  return <button className={`${base} ${palette} ${className}`} {...props} />;
}

/**
 * A flat dropdown. The native control is kept — it is accessible for free and
 * behaves correctly on touch — with only its chrome restyled to match. The
 * default arrow is replaced by an inline SVG data URI, since a background
 * image of a caret is not a gradient and keeps the flat rule intact.
 */
export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const caret =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%239CA3AF" stroke-width="1.5"/></svg>`
    );

  return (
    <select
      className={
        "w-full cursor-pointer appearance-none border border-[#374151] bg-[#1F2937] " +
        "px-3 py-2 pr-8 text-[13px] font-medium text-[#E5E7EB] transition-colors " +
        "hover:enabled:bg-[#374151] disabled:cursor-not-allowed disabled:opacity-40 " +
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] " +
        className
      }
      style={{
        backgroundImage: `url("${caret}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.7rem center",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

/** A flat, solid value chip. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="border border-[#374151] bg-[#0F172A] px-2 py-0.5 font-mono text-[12px] text-[#93C5FD]">
      {children}
    </span>
  );
}
