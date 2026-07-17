"use client";

import { ROUTE_PRESET_LABELS } from "@/lib/routePresets";
import type { SavedPlaySummary } from "@/lib/savedPlays";
import type { PlayerDef, RoutePresetId } from "@/lib/types";
import SavedPlaysList from "./SavedPlaysList";
import { Button, Panel, Section } from "./ui";

export type ActionState =
  | { status: "idle" }
  | { status: "busy"; message: string }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

interface Props {
  selected: PlayerDef | null;
  hasRoute: boolean;
  hasAnyRoutes: boolean;
  drawMode: boolean;
  isPlacingPassTarget: boolean;
  onTogglePlacingPassTarget: () => void;
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  shareEnabled: boolean;
  shareState: ActionState;
  exportState: ActionState;
  onPreset: (preset: RoutePresetId) => void;
  onClearRoute: () => void;
  onResetAllRoutes: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onShare: () => void;
  onExport: () => void;
  saveState: ActionState;
  savedPlays: SavedPlaySummary[];
  activeSavedId: string | null;
  onLoadSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
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
        : "text-[#7C8AA5]";
  return <p className={`text-[12px] leading-snug ${color}`}>{state.message}</p>;
}

/** A small flat crosshair icon for the Pass Target Tool button. */
function CrosshairIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 0.5v3.2M8 12.3v3.2M0.5 8h3.2M12.3 8h3.2" strokeLinecap="round" />
    </svg>
  );
}

export default function RightPanel({
  selected,
  hasRoute,
  hasAnyRoutes,
  drawMode,
  isPlacingPassTarget,
  onTogglePlacingPassTarget,
  canUndo,
  canRedo,
  disabled,
  shareEnabled,
  shareState,
  exportState,
  onPreset,
  onClearRoute,
  onResetAllRoutes,
  onUndo,
  onRedo,
  onShare,
  onExport,
  saveState,
  savedPlays,
  activeSavedId,
  onLoadSaved,
  onDeleteSaved,
}: Props) {
  const isQB = selected?.id === "QB";
  // Routes are an offensive concept; the defense runs its coverage instead.
  const canRoute = Boolean(selected && selected.team === "offense") && !disabled;

  return (
    <Panel>
      <Section title="Active Element">
        <div className="rounded-xl border border-white/[0.06] bg-[#0F172A]/60 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          {selected ? (
            <>
              <p className="text-[14px] font-semibold text-[#E5E7EB]">
                {isQB ? "Quarterback Selected" : `${selected.team === "offense" ? "Offense" : "Defense"} — ${selected.label}`}
              </p>
              <p
                className={`mt-1 text-[12px] ${
                  isQB && !drawMode ? "italic text-[#FB923C]" : "text-[#7C8AA5]"
                }`}
              >
                {selected.team === "offense"
                  ? drawMode
                    ? "Draw Route Mode is on — drag from this player to draw their route."
                    : isQB
                      ? "Use the Pass Target Tool below, or click anywhere along a receiver's route to set the pass target directly."
                      : "Drag to move this player. Press D to draw their route instead."
                  : "Drag to adjust this defender's alignment."}
              </p>
              {isQB && !drawMode && (
                <Button
                  active={isPlacingPassTarget}
                  disabled={disabled}
                  onClick={onTogglePlacingPassTarget}
                  aria-pressed={isPlacingPassTarget}
                  className="mt-2.5 flex w-full items-center justify-center gap-2"
                >
                  <CrosshairIcon />
                  {isPlacingPassTarget ? "Placing Target… (Esc to cancel)" : "Set Pass Target"}
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-[#7C8AA5]">No selection</p>
              <p className="mt-1 text-[12px] text-[#7C8AA5]">
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
        <div className="grid grid-cols-2 gap-1.5">
          <Button disabled={!canRoute || !hasRoute} onClick={onClearRoute} variant="danger">
            Clear Route
          </Button>
          <Button disabled={disabled || !hasAnyRoutes} onClick={onResetAllRoutes} variant="danger">
            Reset All Routes
          </Button>
        </div>
      </Section>

      <Section title="My Saved Plays">
        <SavedPlaysList
          plays={savedPlays}
          activeId={activeSavedId}
          disabled={disabled}
          onLoad={onLoadSaved}
          onDelete={onDeleteSaved}
        />
        <Status state={saveState} />
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
        <p className="text-[11px] text-[#7C8AA5]">Ctrl+Z to undo, Ctrl+Y or Ctrl+Shift+Z to redo.</p>
      </Section>

      <Section title="Save &amp; Share">
        {/* Tier 2, deliberately: Save Play (in the bar above the field) is
            the interface's one Tier 1 button. Share is a secondary action. */}
        <Button
          disabled={disabled || !shareEnabled || shareState.status === "busy"}
          onClick={onShare}
        >
          {shareState.status === "busy" ? "Sharing…" : "Share Play"}
        </Button>
        {shareEnabled ? (
          <Status state={shareState} />
        ) : (
          <p className="text-[12px] text-[#7C8AA5]">
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
