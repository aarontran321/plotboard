"use client";

import { useMemo, useRef, useState } from "react";
import { createContext, computePlayEvents } from "@/lib/simulation";
import type { PlayEvent, PlayEventKind, PlayState } from "@/lib/types";
import { Button } from "./ui";

interface Props {
  play: PlayState;
  playbackT: number;
  playbackDuration: number;
  isPlaying: boolean;
  disabled: boolean;
  onTogglePlay: () => void;
  onScrub: (t: number) => void;
  onStep: (deltaSeconds: number) => void;
}

/** Matches `PlaybackDeck`'s own step size — "one frame" in a board with no fixed frame rate. */
const FRAME_STEP = 1 / 15;

/** Purely cosmetic "filmstrip" segments — equal time slices, not real per-frame
 *  thumbnails (rendering an actual thumbnail per slice would mean an offscreen
 *  replay per segment, which is what GIF export already does at a fixed low
 *  frame rate for a real export; doing that live for a scrubbing UI would be
 *  needlessly expensive for what is, honestly, a decorative filmstrip here). */
const FILMSTRIP_SEGMENTS = 28;

function formatTime(s: number) {
  const clamped = Math.max(0, s);
  const whole = Math.floor(clamped);
  const tenths = Math.floor((clamped - whole) * 10);
  return `${whole}.${tenths}s`;
}

const EVENT_ORDER: PlayEventKind[] = ["release", "deflected", "interception", "dead"];

function EventIcon({ kind }: { kind: PlayEventKind }) {
  switch (kind) {
    case "release":
      // Football.
      return (
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden>
          <ellipse cx="8" cy="8" rx="7" ry="4.4" fill="#8B4513" stroke="#F8FAFC" strokeWidth="0.8" />
          <path d="M3 8h10M6 6.2v3.6M8 5.6v4.8M10 6.2v3.6" stroke="#F8FAFC" strokeWidth="0.7" />
        </svg>
      );
    case "deflected":
      // Shield.
      return (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M8 1.5l5.5 2v4c0 4-2.3 6.4-5.5 7.5-3.2-1.1-5.5-3.5-5.5-7.5v-4l5.5-2Z"
            fill="#38BDF8"
            stroke="#E0F2FE"
            strokeWidth="0.8"
          />
        </svg>
      );
    case "interception":
      // X / crash.
      return (
        <svg width="11" height="11" viewBox="0 0 16 16" stroke="#F87171" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M3 3l10 10M13 3L3 13" />
        </svg>
      );
    case "dead":
      // Whistle.
      return (
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="6" cy="9" r="4.2" fill="#E5E7EB" stroke="#94A3B8" strokeWidth="0.8" />
          <rect x="9" y="4" width="5.5" height="3.4" rx="1" fill="#E5E7EB" stroke="#94A3B8" strokeWidth="0.8" />
          <circle cx="6" cy="9" r="1.1" fill="#334155" />
        </svg>
      );
  }
}

/**
 * The advanced keyframe/event timeline: a ruler with clickable milestone
 * icons (ball released, deflected, intercepted, or a clean whistle — there is
 * no sack/tackle mechanic in this engine, so the crash icon stands in for an
 * interception, the one outcome that's genuinely a defensive, play-ending
 * stop; see `computePlayEvents` in `simulation.ts`), plus a filmstrip-style
 * segment row and standard transport controls. Drives the same playhead as
 * the compact `PlaybackDeck` above the field — scrubbing here or there always
 * agrees, because both ultimately call `FieldCanvas`'s `scrub`/`step`.
 */
export default function KeyframeTimeline({
  play,
  playbackT,
  playbackDuration,
  isPlaying,
  disabled,
  onTogglePlay,
  onScrub,
  onStep,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverEvent, setHoverEvent] = useState<PlayEvent | null>(null);
  const draggingRef = useRef(false);

  const events = useMemo(() => {
    const list = computePlayEvents(createContext(play));
    // Deterministic display order when two events land in the same frame.
    return [...list].sort(
      (a, b) => a.t - b.t || EVENT_ORDER.indexOf(a.kind) - EVENT_ORDER.indexOf(b.kind)
    );
  }, [play]);

  const duration = Math.max(playbackDuration, FRAME_STEP);
  const playheadPct = Math.min(100, Math.max(0, (playbackT / duration) * 100));

  const scrubFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onScrub(frac * duration);
  };

  const activeSegment = Math.min(
    FILMSTRIP_SEGMENTS - 1,
    Math.floor((playbackT / duration) * FILMSTRIP_SEGMENTS)
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button disabled={disabled} onClick={onTogglePlay} aria-label={isPlaying ? "Pause" : "Play"} className="!px-3">
          {isPlaying ? "⏸" : "▶"}
        </Button>
        <Button
          disabled={disabled || isPlaying}
          onClick={() => onStep(-FRAME_STEP)}
          aria-label="Step back one frame"
          className="!px-3"
        >
          ⏮
        </Button>
        <Button
          disabled={disabled || isPlaying}
          onClick={() => onStep(FRAME_STEP)}
          aria-label="Step forward one frame"
          className="!px-3"
        >
          ⏭
        </Button>
        <span className="ml-auto font-mono text-[11px] text-[#7C8AA5]">
          {formatTime(playbackT)} / {formatTime(duration)}
        </span>
      </div>

      {/* Event ruler. */}
      <div
        ref={trackRef}
        className="relative h-8 cursor-pointer rounded-md border border-white/[0.06] bg-[#0a0e17]/70"
        onPointerDown={(e) => {
          if (disabled) return;
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current && !disabled) scrubFromClientX(e.clientX);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
      >
        {/* Playhead. */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]"
          style={{ left: `${playheadPct}%` }}
        />

        {events.map((event, i) => {
          const pct = Math.min(100, Math.max(0, (event.t / duration) * 100));
          return (
            <button
              key={`${event.kind}-${i}`}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onScrub(event.t);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setHoverEvent(event)}
              onMouseLeave={() => setHoverEvent((h) => (h === event ? null : h))}
              className="absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-[#131a2b] transition-transform duration-150 enabled:hover:scale-125 disabled:cursor-not-allowed"
              style={{ left: `${pct}%` }}
              aria-label={`${event.label} at ${formatTime(event.t)}`}
            >
              <EventIcon kind={event.kind} />
            </button>
          );
        })}

        {hoverEvent && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 rounded-md border border-white/10 bg-[#0a0e17] px-2 py-1 text-[11px] whitespace-nowrap text-[#E5E7EB] shadow-lg"
            style={{ left: `${Math.min(100, Math.max(0, (hoverEvent.t / duration) * 100))}%` }}
          >
            {/* "Frame" here is cosmetic — a 30fps-equivalent count for flavor,
                since the sim itself runs on continuous time, not discrete frames. */}
            Frame {Math.round(hoverEvent.t * 30)} ({formatTime(hoverEvent.t)}): {hoverEvent.detail}
          </div>
        )}
      </div>

      {/* Filmstrip: equal-time segment blocks, not literal per-frame thumbnails. */}
      <div className="flex gap-[2px]">
        {Array.from({ length: FILMSTRIP_SEGMENTS }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onScrub((i / FILMSTRIP_SEGMENTS) * duration)}
            aria-label={`Seek to ${formatTime((i / FILMSTRIP_SEGMENTS) * duration)}`}
            className={
              "h-3 flex-1 cursor-pointer rounded-[2px] transition-colors duration-150 disabled:cursor-not-allowed " +
              (i === activeSegment ? "bg-sky-400" : "bg-white/[0.06] hover:bg-white/[0.14]")
            }
          />
        ))}
      </div>
    </div>
  );
}
