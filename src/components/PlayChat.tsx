"use client";

import { useMemo } from "react";
import { computePlayEvents, createContext } from "@/lib/simulation";
import type { PlayEventKind, PlayState } from "@/lib/types";

interface Props {
  play: PlayState;
  /** Seconds into the play; used only to mark which moments have already been reached. */
  playbackT: number;
  disabled: boolean;
  /** Jumps the shared playhead straight to a moment's timestamp. */
  onScrub: (t: number) => void;
}

function formatTime(s: number) {
  return `${Math.max(0, s).toFixed(2)}s`;
}

const KIND_LABEL: Record<PlayEventKind, string> = {
  release: "Ball released",
  deflected: "Pass deflected",
  interception: "Intercepted",
  dead: "Play ends",
};

/** Left-edge accent per moment, matching the palette used elsewhere for the same outcomes. */
const KIND_ACCENT: Record<PlayEventKind, string> = {
  release: "border-l-amber-500",
  deflected: "border-l-sky-400",
  interception: "border-l-rose-500",
  dead: "border-l-[#94A3B8]",
};

/**
 * A chronological chat-style feed of the play's major moments — release,
 * deflection/interception/whistle — built from the same `computePlayEvents`
 * replay the rest of the app uses. Clicking a message jumps the shared
 * playhead straight to it; hovering highlights the card and reveals a small
 * tooltip with the exact time and context, via a pure-CSS `group-hover`
 * (no extra hover state to manage).
 */
export default function PlayChat({ play, playbackT, disabled, onScrub }: Props) {
  const events = useMemo(() => {
    const list = computePlayEvents(createContext(play));
    return [...list].sort((a, b) => a.t - b.t);
  }, [play]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] tracking-wide text-[#7C8AA5] uppercase">Play Chat</span>
        {events.length > 0 && (
          <span className="font-mono text-[10px] text-[#7C8AA5]">{events.length} moments</span>
        )}
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-white/[0.06] bg-[#0a0e17]/60 px-3 py-2.5 text-[12px] text-[#7C8AA5]">
          Draw a route and place a pass target to generate this play&apos;s event feed.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {events.map((event, i) => {
            const reached = playbackT >= event.t;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onScrub(event.t)}
                className={
                  "group relative flex w-44 shrink-0 flex-col gap-0.5 rounded-lg border border-white/[0.06] border-l-4 " +
                  "bg-[#0a0e17]/60 px-2.5 py-2 text-left transition-colors duration-150 " +
                  "enabled:hover:bg-white/[0.05] enabled:cursor-pointer disabled:cursor-not-allowed " +
                  KIND_ACCENT[event.kind] +
                  (reached ? "" : " opacity-60")
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium text-[#E5E7EB]">{KIND_LABEL[event.kind]}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[#7C8AA5]">{formatTime(event.t)}</span>
                </div>
                <p className="truncate text-[11px] text-[#7C8AA5]">{event.detail}</p>

                {/* Tooltip: pure CSS group-hover, no extra state to manage.
                    Rises above the card since the feed now runs horizontally. */}
                <div
                  role="tooltip"
                  className={
                    "pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-[220px] -translate-x-1/2 " +
                    "rounded-md border border-white/10 bg-[#0a0e17] px-2.5 py-1.5 text-[11px] text-[#E5E7EB] " +
                    "opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                  }
                >
                  <span className="font-mono text-[#7DD3FC]">{formatTime(event.t)}</span> — {event.detail}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
