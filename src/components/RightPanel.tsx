"use client";

import { ROUTE_PRESET_LABELS } from "@/lib/routePresets";
import type { SavedPlaySummary } from "@/lib/savedPlays";
import type { PlayerDef, RoutePresetId } from "@/lib/types";
import SavedPlaysList from "./SavedPlaysList";
import { Bento, Button } from "./ui";

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
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  onPreset: (preset: RoutePresetId) => void;
  onClearRoute: () => void;
  onResetAllRoutes: () => void;
  onUndo: () => void;
  onRedo: () => void;
  saveState: ActionState;
  savedPlays: SavedPlaySummary[];
  activeSavedId: string | null;
  onLoadSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
}

const PRESETS = Object.keys(ROUTE_PRESET_LABELS) as RoutePresetId[];

function Status({ state }: { state: ActionState }) {
  if (state.status === "idle") return null;
  const color =
    state.status === "error"
      ? "text-rose-300"
      : state.status === "done"
        ? "text-emerald-300/90"
        : "text-[#A1A1AA]";
  return <p className={`font-mono text-[11px] leading-snug ${color}`}>{state.message}</p>;
}

export default function RightPanel({
  selected,
  hasRoute,
  hasAnyRoutes,
  drawMode,
  canUndo,
  canRedo,
  disabled,
  onPreset,
  onClearRoute,
  onResetAllRoutes,
  onUndo,
  onRedo,
  saveState,
  savedPlays,
  activeSavedId,
  onLoadSaved,
  onDeleteSaved,
}: Props) {
  const isQB = selected?.id === "QB";
  const canRoute = Boolean(selected && selected.team === "offense") && !disabled;

  return (
    <div className="flex flex-col gap-3">
      <Bento title="Active Element">
        <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {selected ? (
            <>
              <p className="text-[14px] font-semibold text-[#EDEDED]">
                {isQB
                  ? "Quarterback Selected"
                  : `${selected.team === "offense" ? "Offense" : "Defense"} — ${selected.label}`}
              </p>
              <p
                className={`mt-1 text-[12px] ${
                  isQB && !drawMode ? "italic text-amber-500/90" : "text-[#A1A1AA]"
                }`}
              >
                {selected.team === "offense"
                  ? drawMode
                    ? "Draw Route Mode — drag from this player to set their path."
                    : isQB
                      ? "Press P or use Set Pass Target in the left rail, or click a receiver route on the field. Once set, press T or Throw Now under the field to release on your timing."
                      : "Drag to move. D to draw their route."
                  : "Drag to adjust this defender's alignment."}
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-[#A1A1AA]">No selection</p>
              <p className="mt-1 text-[12px] text-[#A1A1AA]">
                Click a player to select them, or press P to set a pass target.
              </p>
            </>
          )}
        </div>
      </Bento>

      <Bento title="Route Presets">
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
            Reset All
          </Button>
        </div>
      </Bento>

      <Bento title="My Saved Plays">
        <SavedPlaysList
          plays={savedPlays}
          activeId={activeSavedId}
          disabled={disabled}
          onLoad={onLoadSaved}
          onDelete={onDeleteSaved}
        />
        <Status state={saveState} />
      </Bento>

      <Bento title="History">
        <div className="grid grid-cols-2 gap-1.5">
          <Button disabled={!canUndo || disabled} onClick={onUndo} aria-label="Undo (Ctrl+Z)">
            Undo
          </Button>
          <Button disabled={!canRedo || disabled} onClick={onRedo} aria-label="Redo (Ctrl+Y)">
            Redo
          </Button>
        </div>
        <p className="font-mono text-[10px] text-[#A1A1AA]">⌃Z undo · ⌃Y redo</p>
      </Bento>
    </div>
  );
}
