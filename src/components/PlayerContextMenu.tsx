"use client";

import type { ButtonHTMLAttributes } from "react";

function MenuItem({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        "w-full px-3 py-2 text-left text-[12.5px] font-medium text-[#E5E7EB] " +
        "enabled:hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:text-[#4B5563] " +
        "disabled:opacity-60 cursor-pointer " +
        className
      }
      {...props}
    />
  );
}

interface Props {
  /** Position in CSS pixels, relative to the canvas's positioned wrapper. */
  x: number;
  y: number;
  playerLabel: string;
  hasRoute: boolean;
  canSetPrimary: boolean;
  onDeleteRoute: () => void;
  onChangeRole: () => void;
  onSetPrimary: () => void;
  onShimmer: () => void;
  onClose: () => void;
}

/**
 * A lightweight custom context menu for a right-clicked token, replacing the
 * need to hunt through the right panel for the same handful of actions. A
 * full-viewport backdrop below it closes the menu on any outside click.
 */
export default function PlayerContextMenu({
  x,
  y,
  playerLabel,
  hasRoute,
  canSetPrimary,
  onDeleteRoute,
  onChangeRole,
  onSetPrimary,
  onShimmer,
  onClose,
}: Props) {
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="absolute z-50 w-52 border border-[#374151] bg-[#111827] py-1"
        style={{ left: x, top: y }}
      >
        <div className="border-b border-[#1F2937] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B7280]">
          {playerLabel}
        </div>
        <MenuItem disabled={!hasRoute} onClick={run(onDeleteRoute)}>
          Delete Active Route
        </MenuItem>
        <MenuItem onClick={run(onChangeRole)}>Change Position / Role</MenuItem>
        <MenuItem disabled={!canSetPrimary} onClick={run(onSetPrimary)}>
          Set as Primary Option
        </MenuItem>
        <MenuItem onClick={run(onShimmer)}>Shimmer / Highlight Token</MenuItem>
      </div>
    </>
  );
}
