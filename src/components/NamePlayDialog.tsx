"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PLAY_NAME_LENGTH } from "@/lib/playName";
import { Button, TextField } from "./ui";

interface Props {
  open: boolean;
  /** Prefills the field — normally whatever is in the top-of-field input. */
  initialName: string;
  /** Called with the raw input; blank means "use the default name". */
  onConfirm: (name: string) => void;
  /** Dismissed without exporting. */
  onCancel: () => void;
}

/**
 * Naming step in front of the GIF export.
 *
 * A native `window.prompt` would have been less code, but it is unstyleable,
 * blocks the main thread, and is suppressed outright in some browsers — a
 * feature that silently stops working is worse than the extra component.
 *
 * "Skip" is not the same as "Cancel" here: skipping still exports, under the
 * default name, which is what the brief asked for. Escape and the backdrop
 * cancel outright, because a dialog with no way out is a trap.
 */
export default function NamePlayDialog({ open, initialName, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing to a prop on open */
  useEffect(() => {
    if (!open) return;
    setValue(initialName);
  }, [open, initialName]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Focus the field on open and select it, so typing replaces the prefill.
  useEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [open]);

  // Escape closes, and Tab is kept inside the dialog while it is up.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // Stop the board's own Escape binding from also deselecting behind us.
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "input, button:not([disabled])"
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture, so this runs before the window-level shortcut handler.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/70 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-play-title"
        className="flex w-full max-w-[420px] flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#131a2b]/90 p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      >
        <h2 id="name-play-title" className="text-[14px] font-semibold text-[#F8FAFC]">
          What would you like to name this play before creating the GIF?
        </h2>
        <p className="text-[12px] text-[#7C8AA5]">
          Leave it blank to use a default name. This becomes the GIF&apos;s filename.
        </p>

        <TextField
          ref={inputRef}
          value={value}
          maxLength={MAX_PLAY_NAME_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onConfirm(value);
            }
          }}
          aria-label="Play name"
          placeholder="Untitled Play"
          className="!border-b-2"
        />

        <div className="flex justify-end gap-1.5">
          <Button onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm("")}>Skip</Button>
          <Button variant="primary" onClick={() => onConfirm(value)}>
            Create GIF
          </Button>
        </div>
      </div>
    </div>
  );
}
