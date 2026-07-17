"use client";

import { MAX_PLAY_NAME_LENGTH } from "@/lib/playName";
import { Button, TextField } from "./ui";

interface Props {
  name: string;
  disabled: boolean;
  onName: (name: string) => void;
  onSave: () => void;
}

/**
 * The play's identity, at the top of the field where it reads as a title.
 *
 * The input is uncontrolled by the board's history on purpose: renaming is
 * metadata, not geometry, so it does not go on the undo stack (the same reason
 * formation and coverage are excluded from `Snapshot`).
 */
export default function PlayNameBar({ name, disabled, onName, onSave }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#111827]/70 px-3.5 py-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] backdrop-blur-xl">
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
        className="flex-1"
      />
      <Button variant="primary" disabled={disabled} onClick={onSave} className="shrink-0">
        Save Play
      </Button>
    </div>
  );
}
