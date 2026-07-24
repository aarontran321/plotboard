"use client";

import { EVENT_KIND_COLOR } from "@/lib/field";
import type { PlayEvent } from "@/lib/types";
import { Button } from "./ui";

/**
 * Scrubbing granularity, in seconds. Doubles as the step-forward/back
 * increment — "one frame" in a board with no fixed frame rate of its own.
 */
export const FRAME_STEP = 1 / 15;

interface Props {
  isPlaying: boolean;
  disabled: boolean;
  t: number;
  duration: number;
  events?: PlayEvent[];
  /** Whether "Throw Now" would do anything — pass target set, ball not yet thrown. */
  canThrow: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  onScrub: (t: number) => void;
  onThrowNow: () => void;
}

function RestartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.7 0 3.2.75 4.24 1.93" strokeLinecap="round" />
      <path d="M12 1.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2.5 13.5 12.5 3.5" strokeLinecap="round" />
      <path d="M6 3.5h6.5V10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatTime(s: number) {
  const clamped = Math.max(0, s);
  const whole = Math.floor(clamped);
  const tenths = Math.floor((clamped - whole) * 10);
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${mm}:${String(ss).padStart(2, "0")}.${tenths}`;
}

/**
 * Playback controls under the field: tactile play/pause, restart, throw now,
 * and a thick segmented timeline with event ticks.
 */
export default function PlaybackDeck({
  isPlaying,
  disabled,
  t,
  duration,
  events = [],
  canThrow,
  onTogglePlay,
  onRestart,
  onScrub,
  onThrowNow,
}: Props) {
  const hasRun = duration > 0;
  const scrubDisabled = disabled || isPlaying || !hasRun;
  const midPlay = hasRun && t > 0.001 && t < duration - 0.001;
  const toggleLabel = isPlaying ? "Pause" : midPlay ? "Resume" : "Simulate Play";
  const restartDisabled = disabled || !hasRun || (!isPlaying && t <= 0.001);
  const progress = hasRun ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_28px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <Button
        disabled={disabled}
        onClick={onTogglePlay}
        variant={isPlaying ? "danger" : "primary"}
        className="!px-4"
      >
        {toggleLabel}
      </Button>

      <Button
        disabled={restartDisabled}
        onClick={onRestart}
        aria-label="Restart play"
        title="Restart play"
        className="flex items-center gap-1.5 !px-3"
      >
        <RestartIcon />
        Restart
      </Button>

      <Button
        disabled={disabled || !canThrow}
        onClick={onThrowNow}
        aria-label="Throw now (T)"
        title="Throw now (T) — release the ball immediately"
        className="flex items-center gap-1.5 !px-3"
      >
        <ThrowIcon />
        Throw Now
      </Button>

      <div className="relative min-w-[160px] flex-1 pt-1 pb-0.5">
        <div className="pointer-events-none absolute inset-x-0 top-[11px] flex h-2.5 items-stretch justify-between px-0.5">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={`w-px ${i % 2 === 0 ? "bg-white/20" : "bg-white/8"}`} />
          ))}
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 top-[11px] h-2.5 overflow-hidden rounded-full"
          aria-hidden
        >
          <div className="h-full rounded-full bg-amber-700/35" style={{ width: `${progress}%` }} />
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(duration, FRAME_STEP)}
          step={0.01}
          value={Math.min(t, Math.max(duration, FRAME_STEP))}
          disabled={scrubDisabled}
          onChange={(e) => onScrub(Number(e.target.value))}
          aria-label="Playback position"
          className="relative z-[1] h-2.5 w-full disabled:cursor-not-allowed disabled:opacity-40"
        />

        {hasRun && events.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-[11px] z-[2] h-2.5">
            {events.map((event, i) => (
              <button
                key={i}
                type="button"
                disabled={scrubDisabled}
                onClick={() => onScrub(event.t)}
                title={`${formatTime(event.t)} — ${event.label}`}
                aria-label={`Jump to ${event.label} at ${formatTime(event.t)}`}
                style={{ left: `${Math.min(100, Math.max(0, (event.t / duration) * 100))}%` }}
                className="pointer-events-auto absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.6)] disabled:cursor-not-allowed"
              >
                <span
                  className="block h-full w-full rounded-full"
                  style={{ backgroundColor: EVENT_KIND_COLOR[event.kind] }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="shrink-0 font-mono text-[12px] tracking-tight text-[#A1A1AA] tabular-nums">
        <span className="text-amber-500/90">{formatTime(t)}</span>
        <span className="mx-1 text-[#52525B]">/</span>
        <span>{hasRun ? formatTime(duration) : "--:--.-"}</span>
      </span>
    </div>
  );
}
