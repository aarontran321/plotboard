"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./ui";

/** The four areas of the board a tour step can spotlight. */
export type TourSection = "field" | "left" | "bottom" | "right";

interface StepDef {
  section: TourSection;
  title: string;
  body: ReactNode;
}

const STEPS: StepDef[] = [
  {
    section: "field",
    title: "Core Field Canvas",
    body: (
      <>
        Drag players to sketch positioning. Hold <Kbd>Shift</Kbd> to multi-select, or press{" "}
        <Kbd>D</Kbd> to drop custom route lines.
      </>
    ),
  },
  {
    section: "left",
    title: "Formations & Coverages",
    body: "Instantly snap teams into preset schemes like Spread or Man-to-Man coverage blocks.",
  },
  {
    section: "bottom",
    title: "Simulation Playback & Events",
    body: "Hit play to simulate. Tap key timeline flags to jump straight to decisive handoffs or interceptions instantly.",
  },
  {
    section: "right",
    title: "Route Presets & Context Actions",
    body: "Select an active player to assign classic routes like Slants or Curls in one click, or right-click them directly.",
  },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-slate-600 bg-[#1E293B] px-1 py-0.5 font-mono text-[11px] text-[#7DD3FC]">
      {children}
    </kbd>
  );
}

/**
 * Inline styles this component overwrites on a spotlighted element, so the
 * exact prior values can be restored when the tour moves on.
 *
 * Deliberately does NOT touch `position`/`z-index`: several of the board's
 * cards (the field card, Play Chat) carry `backdrop-blur-xl`, which — per
 * spec — establishes its own stacking context. A child's `z-index` inside
 * one of those only wins *locally*; the card as a whole still loses to the
 * mask, so the "elevated" child would silently render underneath it anyway.
 * Punching an actual hole in the mask (see `SpotlightHole` below) sidesteps
 * that entirely: the target needs no elevation because nothing is ever
 * drawn over it in the first place. Scale and glow are purely cosmetic here.
 */
interface SavedStyle {
  el: HTMLElement;
  transform: string;
  transition: string;
  boxShadow: string;
}

function applySpotlight(el: HTMLElement): SavedStyle {
  const saved: SavedStyle = {
    el,
    transform: el.style.transform,
    transition: el.style.transition,
    boxShadow: el.style.boxShadow,
  };
  el.style.transition = "transform 220ms ease, box-shadow 220ms ease";
  el.style.transform = "scale(1.05)";
  el.style.boxShadow = "0 0 0 4px rgba(56,189,248,0.55), 0 24px 60px -8px rgba(0,0,0,0.65)";
  return saved;
}

function restoreStyle(saved: SavedStyle) {
  saved.el.style.transform = saved.transform;
  saved.el.style.transition = saved.transition;
  saved.el.style.boxShadow = saved.boxShadow;
}

function unionRect(rects: DOMRect[]): DOMRect {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

interface Band {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The dark mask as four rectangles framing `hole` rather than one full-screen
 * div — a literal cutout, so the target needs no z-index gymnastics to read
 * as "on top" (see the note on `applySpotlight`). `null` covers the whole
 * viewport, for the moment before anything has been measured yet.
 */
function spotlightBands(hole: DOMRect | null, vw: number, vh: number): Band[] {
  if (!hole) return [{ top: 0, left: 0, width: vw, height: vh }];
  return [
    { top: 0, left: 0, width: vw, height: hole.top },
    { top: hole.bottom, left: 0, width: vw, height: Math.max(0, vh - hole.bottom) },
    { top: hole.top, left: 0, width: hole.left, height: hole.height },
    { top: hole.top, left: hole.right, width: Math.max(0, vw - hole.right), height: hole.height },
  ].filter((b) => b.width > 0 && b.height > 0);
}

interface Measured {
  active: { el: HTMLElement; rect: DOMRect }[];
  skeleton: { el: HTMLElement; rect: DOMRect }[];
}

const ALL_SECTIONS: TourSection[] = ["field", "left", "bottom", "right"];

interface Props {
  open: boolean;
  getSectionEls: (section: TourSection) => HTMLElement[];
  /** Fires once, when the tour is dismissed one way or another.
   *  `completed` is true for a full run-through or an explicit
   *  "don't show again", so the caller knows whether to persist that. */
  onExit: (completed: boolean) => void;
}

/**
 * A four-step spotlight tour: the rest of the board renders as flat grey
 * "skeleton" placeholders while the step's target section is lifted above a
 * dark backdrop (via z-index, not a clip-path cutout — see `applySpotlight`)
 * and given a small scale pop, so it reads as the one live, interactive
 * thing on screen.
 */
export default function OnboardingTour({ open, getSectionEls, onExit }: Props) {
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- resetting local UI state to match a prop transition (tour re-opening), not a render-time derivation */
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDontShowAgain(false);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const measure = useCallback((): Measured | null => {
    if (!open) return null;
    const activeSection = STEPS[step].section;
    const active: Measured["active"] = [];
    const skeleton: Measured["skeleton"] = [];
    for (const section of ALL_SECTIONS) {
      for (const el of getSectionEls(section)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        (section === activeSection ? active : skeleton).push({ el, rect });
      }
    }
    return { active, skeleton };
  }, [open, step, getSectionEls]);

  // Measure natural (unstyled) rects first, then lift this step's target
  // above the mask. Order matters: `measure()` must run before the spotlight
  // styles are applied, or the scale transform would inflate its own
  // getBoundingClientRect and throw off both the card position and the
  // skeleton layout of everyone else.
  /* eslint-disable react-hooks/set-state-in-effect -- measuring live DOM layout (an external system) is exactly what this effect exists to do */
  useLayoutEffect(() => {
    if (!open) {
      setMeasured(null);
      return;
    }
    const m = measure();
    setMeasured(m);
    if (!m) return;
    const saved = m.active.map(({ el }) => applySpotlight(el));
    return () => {
      for (const s of saved) restoreStyle(s);
    };
  }, [open, step, measure]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Keep the spotlight and skeleton blocks aligned across viewport resizes
  // without re-triggering the (idempotent, but pointless) style toggle above.
  useEffect(() => {
    if (!open) return;
    const onResize = () => setMeasured(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, measure]);

  // Position the floating card relative to whichever side of the target has
  // the most room, clamped to stay fully on-screen either way.
  /* eslint-disable react-hooks/set-state-in-effect -- positioning depends on the card's own rendered size, only knowable after the DOM commits */
  useLayoutEffect(() => {
    if (!measured || measured.active.length === 0) {
      setCardPos(null);
      return;
    }
    const target = unionRect(measured.active.map((a) => a.rect));
    const card = cardRef.current;
    const cw = card?.offsetWidth ?? 320;
    const ch = card?.offsetHeight ?? 160;
    const gap = 18;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBottom = vh - target.bottom;
    const spaceTop = target.top;
    const spaceRight = vw - target.right;
    const spaceLeft = target.left;

    let top: number;
    let left: number;

    if (spaceBottom >= ch + gap) {
      top = target.bottom + gap;
      left = clamp(target.left + target.width / 2 - cw / 2, gap, Math.max(gap, vw - cw - gap));
    } else if (spaceTop >= ch + gap) {
      top = target.top - gap - ch;
      left = clamp(target.left + target.width / 2 - cw / 2, gap, Math.max(gap, vw - cw - gap));
    } else if (spaceRight >= cw + gap) {
      left = target.right + gap;
      top = clamp(target.top + target.height / 2 - ch / 2, gap, Math.max(gap, vh - ch - gap));
    } else if (spaceLeft >= cw + gap) {
      left = target.left - gap - cw;
      top = clamp(target.top + target.height / 2 - ch / 2, gap, Math.max(gap, vh - ch - gap));
    } else {
      // No side has room (a very small viewport) — pin inside the viewport
      // rather than clip off the edge.
      top = clamp(target.bottom + gap, gap, Math.max(gap, vh - ch - gap));
      left = clamp(target.left + target.width / 2 - cw / 2, gap, Math.max(gap, vw - cw - gap));
    }

    setCardPos({ top, left });
  }, [measured]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const finish = useCallback(() => onExit(true), [onExit]);
  const abort = useCallback(() => onExit(dontShowAgain), [onExit, dontShowAgain]);
  const next = useCallback(() => {
    setStep((s) => (s >= STEPS.length - 1 ? s : s + 1));
  }, []);
  const back = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // Arrow-key stepping and Escape-to-abort. Capture phase, same convention
  // as `NamePlayDialog`, so this runs before the board's own shortcuts (a
  // tour Escape must not also trigger the board's deselect-everything).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        abort();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (step >= STEPS.length - 1) finish();
        else next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        back();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, step, abort, finish, next, back]);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const hole = measured && measured.active.length > 0 ? unionRect(measured.active.map((a) => a.rect)) : null;
  const bands =
    typeof window === "undefined"
      ? []
      : spotlightBands(hole, window.innerWidth, window.innerHeight);

  return (
    <>
      {/* The mask: four bands framing a literal hole around the target,
          rather than one full-screen div — also the click-blocker for every
          un-spotlighted control, so the tour can't be nudged out of sync by
          a stray click underneath it. */}
      {bands.map((b, i) => (
        <div
          key={i}
          style={{ position: "fixed", top: b.top, left: b.left, width: b.width, height: b.height }}
          className="z-40 bg-[#020617]/72 backdrop-blur-[1px]"
        />
      ))}

      {measured?.skeleton.map(({ rect }, i) => (
        <div
          key={i}
          aria-hidden
          style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          className="z-[41] overflow-hidden rounded-2xl bg-[#161d2c] ring-1 ring-white/[0.05]"
        >
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-slate-700/35 via-slate-800/20 to-slate-700/35" />
        </div>
      ))}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        style={{
          position: "fixed",
          top: cardPos?.top ?? -9999,
          left: cardPos?.left ?? -9999,
          visibility: cardPos ? "visible" : "hidden",
        }}
        className="z-[46] flex w-[320px] flex-col gap-3 rounded-2xl border border-white/10 bg-[#131a2b]/95 p-4 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-[top,left] duration-200 ease-out"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-sky-400 uppercase">
            Step {step + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={abort}
            aria-label="Close tour"
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[#7C8AA5] hover:bg-white/[0.06] hover:text-[#E5E7EB]"
          >
            ✕
          </button>
        </div>

        <div>
          <h3 id="tour-step-title" className="text-[14.5px] font-semibold text-[#F8FAFC]">
            {current.title}
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#CBD5E1]">{current.body}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[#7C8AA5] select-none">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-3 w-3 accent-sky-500"
          />
          Don&apos;t show this again
        </label>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-sky-400" : "bg-slate-700"}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            {step > 0 && <Button onClick={back}>← Back</Button>}
            {isLast ? (
              <Button variant="primary" onClick={finish}>
                Finish Tour &amp; Don&apos;t Show Again
              </Button>
            ) : (
              <Button variant="primary" onClick={next}>
                Next →
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
