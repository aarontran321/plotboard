"use client";

import { useEffect, useState } from "react";
import { Button, TextField } from "./ui";

export type ShareModalState =
  | { status: "closed" }
  | { status: "saving" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

interface Props {
  state: ShareModalState;
  onClose: () => void;
}

/** How long the "Copied!" confirmation holds before reverting to "Copy Link". */
const COPIED_MS = 1600;

/**
 * The Share Play flow's pop-up: a loading step while the play saves, then the
 * generated link with a one-click copy. Replaces the old inline status line
 * under the name bar with something that reads clearly as "in progress" vs
 * "here is your link" rather than a sentence that changes underneath you.
 */
export default function ShareModal({ state, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  // Reset the "Copied!" confirmation whenever a fresh link is generated (or
  // the modal closes), so a stale confirmation never survives into the next
  // share. This is a prop sync (mirroring `state` from the parent), not a
  // derived value with an alternative render-time home.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
    setCopied(false);
  }, [state]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    if (state.status === "closed") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [state.status, onClose]);

  if (state.status === "closed") return null;

  const onCopy = async () => {
    if (state.status !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
    } catch {
      // Clipboard needs a secure context and can be denied outright; the
      // read-only field is still right there to copy by hand.
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/70 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        className="flex w-full max-w-[440px] flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#131a2b]/90 p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      >
        {state.status === "saving" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#374151] border-t-[#38BDF8] shadow-[0_0_12px_rgba(56,189,248,0.5)]" />
            <p id="share-modal-title" className="text-[13px] text-[#9CA3AF]">
              Saving play…
            </p>
          </div>
        )}

        {state.status === "ready" && (
          <>
            <h2 id="share-modal-title" className="text-[14px] font-semibold text-[#F8FAFC]">
              Link generated
            </h2>
            <div className="flex items-center gap-2">
              <TextField
                readOnly
                value={state.url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1"
              />
              <Button variant="primary" onClick={onCopy} className="shrink-0">
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        )}

        {state.status === "error" && (
          <>
            <h2 id="share-modal-title" className="text-[14px] font-semibold text-[#F8FAFC]">
              Sharing failed
            </h2>
            <p className="text-[12px] text-[#FCA5A5]">{state.message}</p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
