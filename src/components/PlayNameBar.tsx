"use client";

import { MAX_PLAY_NAME_LENGTH } from "@/lib/playName";
import type { ActionState } from "./RightPanel";
import { Button, TextField } from "./ui";

interface Props {
  name: string;
  disabled: boolean;
  onName: (name: string) => void;
  onSave: () => void;
  shareEnabled: boolean;
  sharing: boolean;
  exportState: ActionState;
  onShare: () => void;
  onExport: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function Status({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  const color =
    state.status === "error"
      ? "text-rose-300"
      : state.status === "done"
        ? "text-emerald-300/90"
        : "text-[#A1A1AA]";
  return <p className={`font-mono text-[11px] leading-snug ${color}`}>{state.message}</p>;
}

function UndoIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M3 8h7.5a3 3 0 0 1 0 6H6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 5 3 8l2.5 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Play identity, history, and persistence actions as a wide toolbar strip
 * above the field.
 */
export default function PlayNameBar({
  name,
  disabled,
  onName,
  onSave,
  shareEnabled,
  sharing,
  exportState,
  onShare,
  onExport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const showStatus = exportState.status !== "idle" || !shareEnabled;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3xl border border-white/10 bg-white/[0.02] px-4 py-3 shadow-[0_8px_30px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        <label htmlFor="play-name" className="sr-only">
          Play name
        </label>
        <TextField
          id="play-name"
          value={name}
          disabled={disabled}
          maxLength={MAX_PLAY_NAME_LENGTH}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
          }}
          placeholder="Name this play…"
          className="min-w-[160px] flex-1 text-[15px] font-medium"
        />

        <div className="flex items-center gap-1">
          <Button
            disabled={!canUndo || disabled}
            onClick={onUndo}
            aria-label="Undo (Ctrl+Z)"
            title="Undo (⌃Z)"
            className="!px-2.5"
          >
            <UndoIcon />
          </Button>
          <Button
            disabled={!canRedo || disabled}
            onClick={onRedo}
            aria-label="Redo (Ctrl+Y)"
            title="Redo (⌃Y)"
            className="!px-2.5"
          >
            <UndoIcon flip />
          </Button>
        </div>

        <div className="h-6 w-px shrink-0 bg-white/10" aria-hidden />

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="primary" disabled={disabled} onClick={onSave}>
            Save
          </Button>
          <Button disabled={disabled || !shareEnabled || sharing} onClick={onShare}>
            Share
          </Button>
          <Button disabled={disabled || exportState.status === "busy"} onClick={onExport}>
            {exportState.status === "busy" ? "Rendering…" : "Export GIF"}
          </Button>
        </div>
      </div>

      {showStatus && (
        <div className="flex flex-col gap-1 px-1">
          {!shareEnabled && (
            <p className="font-mono text-[11px] text-[#A1A1AA]">
              Sharing off — set Supabase env vars to enable.
            </p>
          )}
          <Status state={exportState} />
        </div>
      )}
    </div>
  );
}
