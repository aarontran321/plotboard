"use client";

import type { ButtonHTMLAttributes } from "react";
import { ROUTE_PRESET_LABELS } from "@/lib/routePresets";
import type { RoutePresetId } from "@/lib/types";

const PRESETS = Object.keys(ROUTE_PRESET_LABELS) as RoutePresetId[];

function MenuItem({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        "w-full px-3 py-2 text-left text-[12.5px] font-medium text-[#E5E7EB] transition-colors " +
        "enabled:hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-[#4B5563] " +
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
  /** True for an offensive player who isn't the quarterback — the only ones a preset route applies to. */
  canRoute: boolean;
  onPreset: (preset: RoutePresetId) => void;
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
  canRoute,
  onPreset,
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
        className="absolute z-50 w-52 rounded-xl border border-white/[0.08] bg-[#131a2b]/90 py-1 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        style={{ left: x, top: y }}
      >
        <div className="border-b border-white/[0.06] px-3 py-2 text-[11px] font-semibold tracking-[0.1em] text-[#7C8AA5] uppercase">
          {playerLabel}
        </div>

        {canRoute && (
          <div className="grid grid-cols-2 gap-1 border-b border-white/[0.06] px-2 py-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={run(() => onPreset(p))}
                className="cursor-pointer rounded-md border border-slate-700 bg-transparent px-2 py-1 text-[11.5px] font-medium text-[#CBD5E1] transition-colors hover:bg-slate-800/60 hover:border-slate-600"
              >
                {ROUTE_PRESET_LABELS[p]}
              </button>
            ))}
          </div>
        )}

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
