"use client";

import { MAX_PLAY_NAME_LENGTH } from "@/lib/playName";
import { Button } from "./ui";

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
    <div className="flex items-center gap-2 border border-[#1F2937] bg-[#111827] p-2">
      <label htmlFor="play-name" className="sr-only">
        Play name
      </label>
      <input
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
        className={
          "min-w-0 flex-1 border border-[#374151] bg-[#0F172A] px-3 py-2 text-[13px] text-[#E5E7EB] " +
          "placeholder:text-[#4B5563] disabled:cursor-not-allowed disabled:opacity-40 " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B82F6]"
        }
      />
      <Button variant="primary" disabled={disabled} onClick={onSave} className="shrink-0">
        Save Play
      </Button>
    </div>
  );
}
