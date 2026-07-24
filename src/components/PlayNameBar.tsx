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

/**
 * Play identity + persistence actions as a wide bento strip above the field.
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
}: Props) {
  const showStatus = exportState.status !== "idle" || !shareEnabled;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.02] px-4 py-3 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl">
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
          className="min-w-[180px] flex-1 text-[15px] font-medium"
        />
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="primary" disabled={disabled} onClick={onSave}>
            Save Play
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
