"use client";

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
  onTogglePlay: () => void;
  onReset: () => void;
  /** Moves the playhead by a signed number of seconds, clamped by the caller. */
  onStep: (deltaSeconds: number) => void;
  onScrub: (t: number) => void;
}

function formatTime(s: number) {
  const clamped = Math.max(0, s);
  const whole = Math.floor(clamped);
  const tenths = Math.floor((clamped - whole) * 10);
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${mm}:${String(ss).padStart(2, "0")}.${tenths}`;
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3 1.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="3" y="1.5" width="4" height="13" />
      <rect x="9" y="1.5" width="4" height="13" />
    </svg>
  );
}

function StepIcon({ back = false }: { back?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      style={back ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M2 1.5v13l8-6.5-8-6.5Z" />
      <rect x="11.5" y="1.5" width="2.2" height="13" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.7 0 3.2.75 4.24 1.93" strokeLinecap="round" />
      <path d="M12 1.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The full media-style playback deck: play/pause, step frame-by-frame, and a
 * timeline scrubber, sitting under the field. Replaces the single "Simulate
 * Play" button with something that can be inspected and scrubbed, not just
 * run once end to end.
 */
export default function PlaybackDeck({
  isPlaying,
  disabled,
  t,
  duration,
  onTogglePlay,
  onReset,
  onStep,
  onScrub,
}: Props) {
  const hasRun = duration > 0;
  // Scrubbing while the sim is actively advancing would fight the animation
  // loop over the same state, so stepping/scrubbing require a pause first —
  // the deck's Play/Pause button is always available to get there.
  const scrubDisabled = disabled || isPlaying || !hasRun;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-[#0F172A]/70 px-3 py-2.5 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <Button
        disabled={disabled}
        onClick={onReset}
        aria-label="Reset play"
        className="!px-2.5"
      >
        <ResetIcon />
      </Button>

      <div className="flex items-center gap-1">
        <Button
          disabled={scrubDisabled}
          onClick={() => onStep(-FRAME_STEP)}
          aria-label="Step back one frame"
          className="!px-2.5"
        >
          <StepIcon back />
        </Button>
        <Button
          variant="primary"
          disabled={disabled}
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="!px-3.5"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          disabled={scrubDisabled}
          onClick={() => onStep(FRAME_STEP)}
          aria-label="Step forward one frame"
          className="!px-2.5"
        >
          <StepIcon />
        </Button>
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
        className="h-1.5 flex-1 disabled:cursor-not-allowed disabled:opacity-40"
      />

      <Badge>
        {formatTime(t)} / {hasRun ? formatTime(duration) : "--:--"}
      </Badge>
    </div>
  );
}
