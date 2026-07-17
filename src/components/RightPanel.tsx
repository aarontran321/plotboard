"use client";

import { ROUTE_PRESET_LABELS } from "@/lib/routePresets";
import type { PlayerDef, RoutePresetId } from "@/lib/types";
import { Button, Panel, Section } from "./ui";

export type ActionState =
  | { status: "idle" }
  | { status: "busy"; message: string }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

interface Props {
  selected: PlayerDef | null;
  hasRoute: boolean;
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  shareEnabled: boolean;
  shareState: ActionState;
  exportState: ActionState;
  onPreset: (preset: RoutePresetId) => void;
  onClearRoute: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onShare: () => void;
  onExport: () => void;
}

const PRESETS = Object.keys(ROUTE_PRESET_LABELS) as RoutePresetId[];

/** Flat status line under an action button. */
function Status({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  const color =
    state.status === "error"
      ? "text-[#FCA5A5]"
      : state.status === "done"
        ? "text-[#6EE7B7]"
        : "text-[#9CA3AF]";
  return <p className={`text-[12px] leading-snug ${color}`}>{state.message}</p>;
}

export default function RightPanel({
  selected,
  hasRoute,
  canUndo,
  canRedo,
  disabled,
  shareEnabled,
  shareState,
  exportState,
  onPreset,
  onClearRoute,
  onUndo,
  onRedo,
  onShare,
  onExport,
}: Props) {
  const isQB = selected?.id === "QB";
  // Routes are an offensive concept; the defense runs its coverage instead.
  const canRoute = Boolean(selected && selected.team === "offense") && !disabled;

  return (
    <Panel>
      <Section title="Active Element">
        <div className="border border-[#1F2937] bg-[#0F172A] px-3 py-2.5">
          {selected ? (
            <>
              <p className="text-[14px] font-semibold text-[#E5E7EB]">
                {selected.team === "offense" ? "Offense" : "Defense"} — {selected.label}
              </p>
              <p className="mt-1 text-[12px] text-[#6B7280]">
                {isQB
                  ? "Click a receiver's route to set the pass target."
                  : selected.team === "offense"
                    ? "Drag on the field to draw a route."
                    : "Drag to adjust this defender's alignment."}
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-[#6B7280]">No selection</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">
                Click a player to select them.
              </p>
            </>
          )}
        </div>
      </Section>

      <Section title="Route Presets">
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <Button key={p} disabled={!canRoute || isQB} onClick={() => onPreset(p)}>
              {ROUTE_PRESET_LABELS[p]}
            </Button>
          ))}
        </div>
        <Button disabled={!canRoute || !hasRoute} onClick={onClearRoute} variant="danger">
          Clear Route
        </Button>
      </Section>

      <Section title="Undo / Redo">
        <div className="grid grid-cols-2 gap-1.5">
          {/* aria-label, not title: a bare title becomes the accessible name
              and would announce these as "Ctrl+Z" / "Ctrl+Y". */}
          <Button disabled={!canUndo || disabled} onClick={onUndo} aria-label="Undo (Ctrl+Z)">
            Undo
          </Button>
          <Button disabled={!canRedo || disabled} onClick={onRedo} aria-label="Redo (Ctrl+Y)">
            Redo
          </Button>
        </div>
        <p className="text-[11px] text-[#6B7280]">Ctrl+Z to undo, Ctrl+Y or Ctrl+Shift+Z to redo.</p>
      </Section>

      <Section title="Save &amp; Share">
        <Button
          disabled={disabled || !shareEnabled || shareState.status === "busy"}
          onClick={onShare}
        >
          {shareState.status === "busy" ? "Sharing…" : "Share Play"}
        </Button>
        {shareEnabled ? (
          <Status state={shareState} />
        ) : (
          <p className="text-[12px] text-[#6B7280]">
            Sharing is off until Supabase environment variables are set.
          </p>
        )}
      </Section>

      <Section title="Export Play">
        <Button disabled={disabled || exportState.status === "busy"} onClick={onExport}>
          {exportState.status === "busy" ? "Rendering…" : "Export Play (GIF)"}
        </Button>
        <Status state={exportState} />
      </Section>
    </Panel>
  );
}
