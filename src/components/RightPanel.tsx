"use client";

import { ROUTE_PRESET_LABELS } from "@/lib/routePresets";
import type { SavedPlaySummary } from "@/lib/savedPlays";
import type { PlayerDef, RoutePresetId } from "@/lib/types";
import SavedPlaysList from "./SavedPlaysList";
import { Bento, Button, Divider, Fieldset } from "./ui";

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
  disabled: boolean;
  onPreset: (preset: RoutePresetId) => void;
  onClearRoute: () => void;
  onResetAllRoutes: () => void;
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
  disabled,
  onPreset,
  onClearRoute,
  onResetAllRoutes,
  saveState,
  savedPlays,
  activeSavedId,
  onLoadSaved,
  onDeleteSaved,
}: Props) {
  const isQB = selected?.id === "QB";
  const canRoute = Boolean(selected && selected.team === "offense") && !disabled;

  const title = !selected
    ? "No selection"
    : isQB
      ? "Quarterback"
      : `${selected.team === "offense" ? "Offense" : "Defense"} — ${selected.label}`;

  const hint = !selected
    ? "Click a player to select them, or press P to set a pass target."
    : selected.team === "offense"
      ? drawMode
        ? "Draw Route Mode — drag from this player to set their path."
        : isQB
          ? "Press P (or a receiver's route) to aim, then T to release on your timing."
          : "Drag to move. D draws their route."
      : "Drag to adjust this defender's alignment.";

  return (
    <div className="flex flex-col gap-4">
      <Bento title="Selection">
        <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className={`text-[14px] font-semibold ${selected ? "text-[#EDEDED]" : "text-[#A1A1AA]"}`}>
            {title}
          </p>
          <p
            className={`mt-1 text-[12px] leading-snug ${
              isQB && !drawMode ? "text-blue-400/90" : "text-[#A1A1AA]"
            }`}
          >
            {hint}
          </p>
        </div>

        <Divider className="my-0.5" />

        <Fieldset label="Route Presets">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p} disabled={!canRoute || isQB} onClick={() => onPreset(p)}>
                {ROUTE_PRESET_LABELS[p]}
              </Button>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button disabled={!canRoute || !hasRoute} onClick={onClearRoute} variant="danger">
              Clear Route
            </Button>
            <Button disabled={disabled || !hasAnyRoutes} onClick={onResetAllRoutes} variant="danger">
              Reset All
            </Button>
          </div>
        </Fieldset>
      </Bento>

      <Bento title="Saved Plays">
        <SavedPlaysList
          plays={savedPlays}
          activeId={activeSavedId}
          disabled={disabled}
          onLoad={onLoadSaved}
          onDelete={onDeleteSaved}
        />
        <Status state={saveState} />
      </Bento>
    </div>
  );
}
