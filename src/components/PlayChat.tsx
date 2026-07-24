"use client";

import { useMemo } from "react";
import { computePlayEvents, createContext } from "@/lib/simulation";
import type { PlayEventKind, PlayState } from "@/lib/types";

interface Props {
  play: PlayState;
  playbackT: number;
  disabled: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
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

/** Soft offense/defense-adjacent tones — no neon. */
const KIND_TONE: Record<PlayEventKind, string> = {
  release: "text-[#93C5FD]",
  deflected: "text-[#FCD34D]",
  interception: "text-[#FCA5A5]",
  dead: "text-[#A1A1AA]",
};

/**
 * Terminal-style event log for the play's major moments.
 */
export default function PlayChat({
  play,
  playbackT,
  disabled,
  collapsed = false,
  onToggleCollapsed,
  onScrub,
}: Props) {
  const events = useMemo(() => {
    const list = computePlayEvents(createContext(play));
    return [...list].sort((a, b) => a.t - b.t);
  }, [play]);

  return (
    <div className="flex h-full flex-col gap-2">
      <button
        type="button"
        onClick={onToggleCollapsed}
        disabled={!onToggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full cursor-pointer items-center justify-between gap-2 text-left select-none disabled:cursor-default"
      >
        <span className="font-mono text-[11px] tracking-wide text-[#A1A1AA] uppercase">
          Event Log
        </span>
        <span className="flex items-center gap-2">
          {events.length > 0 && (
            <span className="font-mono text-[10px] text-[#A1A1AA]">{events.length} events</span>
          )}
          {onToggleCollapsed && (
            <span
              className={`text-[10px] text-[#A1A1AA] transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          )}
        </span>
      </button>

      {collapsed ? null : events.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[12px] leading-snug text-[#A1A1AA]">
          $ waiting — draw a route and set a pass target to emit events
        </p>
      ) : (
        <ul className="max-h-40 overflow-y-auto rounded-2xl border border-white/10 bg-black/50 px-3 py-2 font-mono text-[12px] leading-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {events.map((event, i) => {
            const reached = playbackT >= event.t;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onScrub(event.t)}
                  title={event.detail}
                  className={
                    "group flex w-full items-baseline gap-2 py-1 text-left transition-opacity " +
                    "enabled:cursor-pointer enabled:hover:bg-white/[0.03] disabled:cursor-not-allowed " +
                    (reached ? "opacity-100" : "opacity-45")
                  }
                >
                  <span className="shrink-0 text-[#52525B]">[{formatTime(event.t)}]</span>
                  <span className={KIND_TONE[event.kind]}>{KIND_LABEL[event.kind]}</span>
                  <span className="truncate text-[#71717A] group-hover:text-[#A1A1AA]">
                    {event.detail}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
