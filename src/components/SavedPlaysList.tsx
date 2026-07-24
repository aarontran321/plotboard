"use client";

import type { SavedPlaySummary } from "@/lib/savedPlays";

interface Props {
  plays: SavedPlaySummary[];
  activeId: string | null;
  disabled: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

function savedAgo(savedAt: number): string {
  const seconds = Math.round((Date.now() - savedAt) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function SavedPlaysList({ plays, activeId, disabled, onLoad, onDelete }: Props) {
  if (plays.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2.5 text-[12px] text-[#A1A1AA]">
        No saved plays yet. Name a play and hit Save Play.
      </p>
    );
  }

  return (
    <ul className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto">
      {plays.map((p) => {
        const active = p.id === activeId;
        return (
          <li key={p.id} className="flex items-stretch gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onLoad(p.id)}
              aria-current={active ? "true" : undefined}
              aria-label={`Load ${p.name}, saved ${savedAgo(p.savedAt)}`}
              className={
                "flex min-w-0 flex-1 cursor-pointer flex-col items-start rounded-xl border px-2.5 py-1.5 text-left " +
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[transform,background-color,border-color] duration-150 " +
                "enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700/70 " +
                (active
                  ? "border-blue-700/55 bg-blue-950/45 text-[#EDEDED]"
                  : "border-white/10 bg-white/[0.03] text-[#EDEDED] enabled:hover:bg-white/[0.06]")
              }
            >
              <span className="w-full truncate text-[12px] font-medium">{p.name}</span>
              <span className={`font-mono text-[10px] ${active ? "text-blue-400/80" : "text-[#A1A1AA]"}`}>
                {savedAgo(p.savedAt)}
              </span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDelete(p.id)}
              aria-label={`Delete ${p.name}`}
              title={`Delete ${p.name}`}
              className={
                "shrink-0 cursor-pointer rounded-xl border border-rose-900/40 bg-white/[0.03] px-2 text-rose-300/80 " +
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-150 " +
                "enabled:active:scale-95 enabled:hover:bg-rose-950/40 enabled:hover:text-rose-200 " +
                "disabled:cursor-not-allowed disabled:opacity-40 " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700/70"
              }
            >
              <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" fill="none">
                <path
                  d="M2.5 3.5h9M5.5 3.5V2h3v1.5M3.5 3.5l.6 8.2a.8.8 0 0 0 .8.8h4.2a.8.8 0 0 0 .8-.8l.6-8.2M6 6v4M8 6v4"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
