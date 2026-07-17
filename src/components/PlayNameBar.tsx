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
  shareState: ActionState;
  exportState: ActionState;
  onShare: () => void;
  onExport: () => void;
}

/** Flat status line under an action button. */
function Status({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  const color =
    state.status === "error"
      ? "text-[#FCA5A5]"
      : state.status === "done"
        ? "text-[#6EE7B7]"
        : "text-[#7C8AA5]";
  return <p className={`text-[12px] leading-snug ${color}`}>{state.message}</p>;
}

/**
 * The play's identity and its persistence actions, at the top of the field
 * where the name reads as a title. Save, Share and Export all live here
 * together — everything you do *to a play as a whole* is in one place, rather
 * than Save sitting up here while Share and Export hid in the right rail.
 *
 * The input is uncontrolled by the board's history on purpose: renaming is
 * metadata, not geometry, so it does not go on the undo stack (the same reason
 * formation and coverage are excluded from `Snapshot`).
 */
export default function PlayNameBar({
  name,
  disabled,
  onName,
  onSave,
  shareEnabled,
  shareState,
  exportState,
  onShare,
  onExport,
}: Props) {
  const showStatus =
    shareState.status !== "idle" || exportState.status !== "idle" || !shareEnabled;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#111827]/70 px-3.5 py-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] backdrop-blur-xl">
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
            // Enter saves, which is what pressing it in a lone text field means.
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
          }}
          placeholder="Enter play name (e.g., Vertical Cross, Flex Offense)..."
          className="min-w-[180px] flex-1"
        />
        <div className="flex shrink-0 items-center gap-2">
          {/* Save is the one Tier 1 action; Share and Export are secondary. */}
          <Button variant="primary" disabled={disabled} onClick={onSave}>
            Save Play
          </Button>
          <Button
            disabled={disabled || !shareEnabled || shareState.status === "busy"}
            onClick={onShare}
          >
            {shareState.status === "busy" ? "Sharing…" : "Share Play"}
          </Button>
          <Button disabled={disabled || exportState.status === "busy"} onClick={onExport}>
            {exportState.status === "busy" ? "Rendering…" : "Export Play (GIF)"}
          </Button>
        </div>
      </div>

      {showStatus && (
        <div className="flex flex-col gap-1 px-1">
          {shareEnabled ? (
            <Status state={shareState} />
          ) : (
            <p className="text-[12px] text-[#7C8AA5]">
              Sharing is off until Supabase environment variables are set.
            </p>
          )}
          <Status state={exportState} />
        </div>
      )}
    </div>
  );
}
