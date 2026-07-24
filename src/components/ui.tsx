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
 * Editorial bento / tactile glass primitives.
 *
 * Glass modules sit on off-black with hairline borders. Buttons read as
 * physical controls (inset highlight + drop shadow + press scale). Active
 * toggles use a matte blue accent — never a full cyan fill.
 */

const BENTO =
  "rounded-3xl border border-white/10 bg-white/[0.02] p-4 " +
  "shadow-[0_12px_40px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-4 ${BENTO} ${className}`}>{children}</div>;
}

/** One asymmetric bento tile — use instead of stacking everything in a single Panel. */
export function Bento({
  title,
  children,
  className = "",
  action,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2.5 ${BENTO} ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title ? (
            <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[#A1A1AA] uppercase">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
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
      className={`shrink-0 text-[#A1A1AA] transition-transform duration-150 ${open ? "rotate-0" : "-rotate-90"}`}
    >
      <path
        d="M1.5 3.5L5 7l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-[#A1A1AA] uppercase">{title}</h2>
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
    "rounded-xl px-3 py-2 text-[13px] font-medium border select-none cursor-pointer " +
    "transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out " +
    "enabled:active:scale-95 " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600/70 " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_8px_-2px_rgba(0,0,0,0.55)]";

  const palette = active
    ? "border-blue-700/60 bg-blue-950/50 text-[#EDEDED] " +
      "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_0_12px_rgba(37,99,235,0.3),0_2px_8px_-2px_rgba(0,0,0,0.55)]"
    : variant === "primary"
      ? "border-blue-700/50 bg-blue-900/40 text-[#EDEDED] " +
        "enabled:hover:bg-blue-800/45 enabled:hover:border-blue-600/60"
      : variant === "danger"
        ? "border-rose-900/40 bg-transparent text-rose-300/80 " +
          "enabled:hover:border-rose-700/50 enabled:hover:bg-rose-950/30 enabled:hover:text-rose-200"
        : "border-white/10 bg-white/[0.03] text-[#EDEDED] " +
          "enabled:hover:bg-white/[0.06] enabled:hover:border-white/15";

  return <button className={`${base} ${palette} ${className}`} {...props} />;
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

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
      className="inline-flex w-full gap-0.5 rounded-2xl border border-white/10 bg-black/40 p-1"
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
              "flex-1 cursor-pointer rounded-xl px-2 py-1.5 text-[12.5px] font-medium " +
              "transition-[transform,background-color,color,border-color,box-shadow] duration-150 " +
              "enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 " +
              (isActive
                ? "border border-blue-700/55 bg-blue-950/55 text-[#EDEDED] " +
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_0_10px_rgba(37,99,235,0.25)]"
                : "border border-transparent text-[#A1A1AA] enabled:hover:bg-white/[0.04] enabled:hover:text-[#EDEDED]")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const caret =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%23A1A1AA" stroke-width="1.5"/></svg>`
    );

  return (
    <select
      className={
        "w-full cursor-pointer appearance-none border-0 border-b-[1.5px] border-white/15 bg-transparent " +
        "px-0.5 py-2 pr-6 text-[13px] font-medium text-[#EDEDED] transition-colors duration-150 " +
        "hover:enabled:border-white/30 focus:border-b-2 focus:border-blue-600 focus:outline-none " +
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

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={
          "w-full min-w-0 border-0 border-b-[1.5px] border-white/15 bg-transparent px-0.5 py-2 " +
          "text-[13px] text-[#EDEDED] transition-colors duration-150 placeholder:text-[#52525B] " +
          "hover:enabled:border-white/30 focus:border-b-2 focus:border-blue-600 focus:outline-none " +
          "disabled:cursor-not-allowed disabled:opacity-40 " +
          className
        }
        {...props}
      />
    );
  }
);

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
        "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-xl border " +
        "border-white/10 bg-white/[0.03] text-[12px] font-bold text-[#A1A1AA] " +
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-150 " +
        "enabled:active:scale-95 hover:bg-white/[0.06] hover:text-[#EDEDED] " +
        className
      }
    >
      {glyph}
    </button>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-0.5 font-mono text-[12px] text-blue-400/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      {children}
    </span>
  );
}
