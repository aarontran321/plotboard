"use client";

import type { SavedPlaySummary } from "@/lib/savedPlays";

interface Props {
  plays: SavedPlaySummary[];
  /** The saved play currently on the board, if any. */
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
      <p className="border border-[#1F2937] bg-[#0F172A] px-3 py-2.5 text-[12px] text-[#6B7280]">
        No saved plays yet. Name a play above and hit Save Play.
      </p>
    );
  }

  return (
    <ul className="flex max-h-[220px] flex-col gap-1 overflow-y-auto">
      {plays.map((p) => {
        const active = p.id === activeId;
        return (
          <li key={p.id} className="flex items-stretch gap-1">
            {/* The whole row is the load target, so the name itself is the button. */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onLoad(p.id)}
              aria-current={active ? "true" : undefined}
              // Without this the name and the timestamp run together into
              // "Vertical Crossjust now" when read aloud.
              aria-label={`Load ${p.name}, saved ${savedAgo(p.savedAt)}`}
              className={
                "flex min-w-0 flex-1 cursor-pointer flex-col items-start border px-2.5 py-1.5 text-left transition-colors " +
                "disabled:cursor-not-allowed disabled:opacity-40 " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6] " +
                (active
                  ? "border-[#3B82F6] bg-[#1D4ED8] text-white"
                  : "border-[#374151] bg-[#1F2937] text-[#E5E7EB] enabled:hover:bg-[#374151]")
              }
            >
              <span className="w-full truncate text-[12px] font-medium">{p.name}</span>
              <span className={`text-[10px] ${active ? "text-[#BFDBFE]" : "text-[#6B7280]"}`}>
                {savedAgo(p.savedAt)}
              </span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDelete(p.id)}
              // The name is in the label because a list of "Delete" buttons is
              // unusable to a screen reader.
              aria-label={`Delete ${p.name}`}
              title={`Delete ${p.name}`}
              className={
                "shrink-0 cursor-pointer border border-[#4B5563] bg-[#1F2937] px-2 text-[#FCA5A5] transition-colors " +
                "enabled:hover:bg-[#374151] enabled:hover:text-[#F87171] " +
                "disabled:cursor-not-allowed disabled:opacity-40 " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]"
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
