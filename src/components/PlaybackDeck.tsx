"use client";

import { EVENT_KIND_COLOR } from "@/lib/field";
import type { PlayEvent } from "@/lib/types";
import { Badge, Button } from "./ui";

/**
 * Scrubbing granularity, in seconds. Doubles as the step-forward/back
 * increment — "one frame" in a board with no fixed frame rate of its own.
 */
export const FRAME_STEP = 1 / 15;

interface Props {
  isPlaying: boolean;
  disabled: boolean;
  /** Seconds into the play. */
  t: number;
  /** Total seconds the play is expected to take; 0 before a run exists. */
  duration: number;
  /** Key moments (release, deflection, etc.), rendered as clickable ticks on the track. */
  events?: PlayEvent[];
  onTogglePlay: () => void;
  /** Rewinds the play to its first frame, whether playing, frozen, or finished. */
  onRestart: () => void;
  onScrub: (t: number) => void;
}

function RestartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.7 0 3.2.75 4.24 1.93" strokeLinecap="round" />
      <path d="M12 1.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
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
 * The playback deck: a play/pause toggle, a Restart button, and a timeline
 * scrubber, sitting under the field. Pausing *freezes* on the current frame
 * (it does not reset); Restart is the only control that rewinds to the start.
 */
export default function PlaybackDeck({
  isPlaying,
  disabled,
  t,
  duration,
  events = [],
  onTogglePlay,
  onRestart,
  onScrub,
}: Props) {
  const hasRun = duration > 0;
  // Scrubbing while the sim is actively advancing would fight the animation
  // loop over the same state, so scrubbing requires pausing first — the
  // deck's toggle button is always available to get there.
  const scrubDisabled = disabled || isPlaying || !hasRun;

  // "Resume" once the play has been paused partway through; "Simulate Play"
  // from a fresh or fully-rewound state.
  const midPlay = hasRun && t > 0.001 && t < duration - 0.001;
  const toggleLabel = isPlaying ? "Pause" : midPlay ? "Resume" : "Simulate Play";
  // Restart is meaningless before a run exists or when already at frame 0.
  const restartDisabled = disabled || !hasRun || (!isPlaying && t <= 0.001);

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-[#0F172A]/70 px-3 py-2.5 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] backdrop-blur-xl">
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

      <div className="relative flex-1">
        <input
          type="range"
          min={0}
          max={Math.max(duration, FRAME_STEP)}
          step={0.01}
          value={Math.min(t, Math.max(duration, FRAME_STEP))}
          disabled={scrubDisabled}
          onChange={(e) => onScrub(Number(e.target.value))}
          aria-label="Playback position"
          className="h-1.5 w-full disabled:cursor-not-allowed disabled:opacity-40"
        />

        {/* Event ticks: pinned to the track regardless of the input's own
            padding, so a click on one seeks straight to that moment instead
            of requiring the user to find it by scrubbing. */}
        {hasRun && events.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0 -translate-y-1/2">
            {events.map((event, i) => (
              <button
                key={i}
                type="button"
                disabled={scrubDisabled}
                onClick={() => onScrub(event.t)}
                title={`${formatTime(event.t)} — ${event.label}`}
                aria-label={`Jump to ${event.label} at ${formatTime(event.t)}`}
                style={{ left: `${Math.min(100, Math.max(0, (event.t / duration) * 100))}%` }}
                className="pointer-events-auto absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.6)] disabled:cursor-not-allowed"
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

      <Badge>
        {formatTime(t)} / {hasRun ? formatTime(duration) : "--:--"}
      </Badge>
    </div>
  );
}
