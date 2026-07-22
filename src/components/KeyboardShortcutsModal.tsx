"use client";

import { useEffect } from "react";
import { Button } from "./ui";

interface Props {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Launches the guided feature tour and closes this modal. */
  onStartTour: () => void;
}

interface Shortcut {
  keys: string;
  description: string;
}

interface Group {
  title: string;
  shortcuts: Shortcut[];
}

const GROUPS: Group[] = [
  {
    title: "Playback",
    shortcuts: [
      { keys: "Space", description: "Play / pause the simulation" },
      { keys: "T", description: "Throw Now — QB releases immediately, whenever a target is set" },
      { keys: "R", description: "Reset to pre-snap alignment" },
      { keys: "← / →", description: "Step one frame back / forward" },
      { keys: "Click a timeline tick", description: "Jump to that moment (release, deflection, etc.)" },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: "D", description: "Toggle Draw Route Mode / Move Players" },
      { keys: "Ctrl/⌘+Z", description: "Undo" },
      { keys: "Ctrl/⌘+Y or Ctrl/⌘+Shift+Z", description: "Redo" },
      { keys: "Esc", description: "Deselect, or cancel the Pass Target Tool" },
      { keys: "?", description: "Open this shortcuts reference" },
    ],
  },
  {
    title: "Canvas & Selection",
    shortcuts: [
      { keys: "Drag a player", description: "Reposition them, held to their side of the neutral zone" },
      { keys: "Shift+Click a player", description: "Add or remove them from the current selection" },
      { keys: "Drag over open field", description: "Marquee-select every player inside the box" },
      { keys: "Right-click a player", description: "Quick actions: route presets, clear route, role, primary option" },
      { keys: "Drag the line of scrimmage", description: "Move the whole play forward or back" },
      { keys: "Drag from a selected receiver (Draw mode)", description: "Draw their route" },
      { keys: "Click a receiver's route (QB selected)", description: "Set the pass target" },
    ],
  },
];

/**
 * A fixed "?" utility button plus the reference modal it opens — the one
 * place every hotkey and mouse/modifier combo in the app is listed, for
 * anyone who hasn't memorised them from the inline hints scattered around
 * the board.
 */
export default function KeyboardShortcutsModal({ open, onOpen, onClose, onStartTour }: Props) {
  // Escape closes, same convention as the other dialogs in this app; capture
  // phase so it runs before the board's own Escape binding (deselect).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
        className="fixed right-4 bottom-4 z-40 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/[0.1] bg-[#131a2b]/90 text-[15px] font-bold text-[#7C8AA5] shadow-[0_12px_28px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-colors hover:border-sky-400/50 hover:text-sky-300"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/70 p-4 backdrop-blur-sm"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            className="flex max-h-[85vh] w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#131a2b]/95 p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between">
              <h2 id="shortcuts-title" className="text-[14px] font-semibold text-[#F8FAFC]">
                Keyboard &amp; Mouse Shortcuts
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[#7C8AA5] hover:bg-white/[0.06] hover:text-[#E5E7EB]"
              >
                ✕
              </button>
            </div>

            <Button variant="primary" onClick={onStartTour} className="w-full">
              Take the Feature Tour
            </Button>

            {GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-1.5">
                <h3 className="text-[11px] font-semibold tracking-[0.14em] text-[#7C8AA5] uppercase">
                  {group.title}
                </h3>
                <div className="flex flex-col divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0F172A]/60">
                  {group.shortcuts.map((s) => (
                    <div key={s.keys} className="flex items-center justify-between gap-4 px-3 py-2">
                      <span className="text-[12.5px] text-[#CBD5E1]">{s.description}</span>
                      <kbd className="shrink-0 rounded-md border border-slate-700 bg-[#1E293B] px-2 py-0.5 font-mono text-[11px] text-[#7DD3FC]">
                        {s.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
