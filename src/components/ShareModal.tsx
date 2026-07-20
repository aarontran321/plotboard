"use client";

import { useEffect, useState } from "react";

export type ShareModalState =
  | { status: "closed" }
  | { status: "saving" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

interface Props {
  state: ShareModalState;
  onClose: () => void;
}

/** How long the copy button holds its confirmation before reverting. */
const COPIED_MS = 1600;

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The Share Play flow's pop-up: a loading step while the play saves, then a
 * confirmation card — a glowing green check, the generated link in a read-only
 * field, and a green copy button tucked into the field's trailing edge.
 */
export default function ShareModal({ state, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  // Reset the copy confirmation whenever a fresh link is generated (or the
  // modal closes), so a stale confirmation never survives into the next share.
  // This is a prop sync (mirroring `state` from the parent), not a derived
  // value with an alternative render-time home.
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
        className="relative flex w-full max-w-[440px] flex-col items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#0F1626]/95 p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-md text-[#7C8AA5] transition-colors hover:bg-white/[0.06] hover:text-[#E5E7EB]"
        >
          <CloseIcon />
        </button>

        {state.status === "saving" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#374151] border-t-[#38BDF8] shadow-[0_0_12px_rgba(56,189,248,0.5)]" />
            <p id="share-modal-title" className="text-[13px] text-[#9CA3AF]">
              Saving play…
            </p>
          </div>
        )}

        {state.status === "ready" && (
          <>
            <h2
              id="share-modal-title"
              className="mt-1 text-center text-[15px] font-bold uppercase tracking-[0.12em] text-[#F8FAFC]"
            >
              Link Generated!
            </h2>

            {/* Glowing green confirmation badge. */}
            <span className="my-1 flex h-16 w-16 items-center justify-center rounded-full bg-[#10241B] text-[#34D399] shadow-[0_0_22px_rgba(52,211,153,0.55)] ring-2 ring-[#34D399]/70">
              <CheckIcon />
            </span>

            {/* Read-only link with a green copy button tucked into its end. */}
            <div className="flex w-full items-center gap-2 rounded-lg border border-white/[0.22] bg-[#0A0F1A] py-1.5 pl-3 pr-1.5">
              <input
                readOnly
                value={state.url}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate border-0 bg-transparent text-[13px] text-[#E7EDF3] outline-none"
              />
              <button
                type="button"
                onClick={onCopy}
                aria-label={copied ? "Copied" : "Copy link"}
                title={copied ? "Copied!" : "Copy link"}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#22C55E] px-2.5 text-[12px] font-semibold text-white shadow-[0_0_14px_rgba(34,197,94,0.5)] transition-colors hover:bg-[#16A34A]"
              >
                <CheckIcon size={15} />
                {copied ? "Copied!" : ""}
              </button>
            </div>
          </>
        )}

        {state.status === "error" && (
          <>
            <h2 id="share-modal-title" className="mt-1 text-[14px] font-semibold text-[#F8FAFC]">
              Sharing failed
            </h2>
            <p className="text-center text-[12px] text-[#FCA5A5]">{state.message}</p>
          </>
        )}
      </div>
    </div>
  );
}
