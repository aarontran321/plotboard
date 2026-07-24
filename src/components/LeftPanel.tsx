"use client";

import type { FieldTheme } from "@/lib/field";
import {
  COVERAGE_LABELS,
  DEFENSE_FORMATION_LABELS,
  FORMATION_LABELS,
} from "@/lib/formations";
import type { CoverageId, DefenseFormationId, FormationId } from "@/lib/types";
import { Badge, Bento, Segmented, Select } from "./ui";

interface Props {
  formation: FormationId;
  defenseFormation: DefenseFormationId;
  coverage: CoverageId;
  speed: number;
  drawMode: boolean;
  theme: FieldTheme;
  disabled: boolean;
  onFormation: (f: FormationId) => void;
  onDefenseFormation: (d: DefenseFormationId) => void;
  onCoverage: (c: CoverageId) => void;
  onSpeed: (s: number) => void;
  onDrawMode: (on: boolean) => void;
  onTheme: (t: FieldTheme) => void;
}

const FORMATIONS = Object.keys(FORMATION_LABELS) as FormationId[];
const DEFENSE_FORMATIONS = Object.keys(DEFENSE_FORMATION_LABELS) as DefenseFormationId[];
const COVERAGES = Object.keys(COVERAGE_LABELS) as CoverageId[];

export default function LeftPanel({
  formation,
  defenseFormation,
  coverage,
  speed,
  drawMode,
  theme,
  disabled,
  onFormation,
  onDefenseFormation,
  onCoverage,
  onSpeed,
  onDrawMode,
  onTheme,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <Bento title="Offense Formation">
        <Select
          value={formation}
          disabled={disabled}
          aria-label="Offense formation"
          onChange={(e) => onFormation(e.target.value as FormationId)}
        >
          {FORMATIONS.map((f) => (
            <option key={f} value={f}>
              {FORMATION_LABELS[f]}
            </option>
          ))}
        </Select>
      </Bento>

      <Bento title="Defense Formation">
        <Select
          value={defenseFormation}
          disabled={disabled}
          aria-label="Defense formation"
          onChange={(e) => onDefenseFormation(e.target.value as DefenseFormationId)}
        >
          {DEFENSE_FORMATIONS.map((d) => (
            <option key={d} value={d}>
              {DEFENSE_FORMATION_LABELS[d]}
            </option>
          ))}
        </Select>
      </Bento>

      <Bento title="Defensive Coverage">
        <Segmented
          value={coverage}
          disabled={disabled}
          ariaLabel="Defensive coverage"
          onChange={onCoverage}
          options={COVERAGES.map((c) => ({ value: c, label: COVERAGE_LABELS[c] }))}
        />
      </Bento>

      <Bento title="Tool Selection">
        <Segmented
          value={drawMode ? "draw" : "move"}
          disabled={disabled}
          ariaLabel="Interaction tool"
          onChange={(v) => onDrawMode(v === "draw")}
          options={[
            { value: "move", label: "Move" },
            { value: "draw", label: "Draw Routes" },
          ]}
        />
        <p className="text-[11px] leading-snug text-[#A1A1AA]">
          {drawMode
            ? "Drag from an offensive player to draw their route. D toggles back to move."
            : "Drag players to reposition. D arms route drawing."}
        </p>
      </Bento>

      <Bento title="Field Style">
        <Segmented
          value={theme}
          disabled={disabled}
          ariaLabel="Field style"
          onChange={onTheme}
          options={[
            { value: "turf", label: "Turf" },
            { value: "chalkboard", label: "Chalk" },
          ]}
        />
      </Bento>

      <Bento title="Sim Speed">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.5}
            value={speed}
            disabled={disabled}
            onChange={(e) => onSpeed(Number(e.target.value))}
            aria-label="Simulation speed"
            className="h-2.5 flex-1 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <Badge>{speed.toFixed(1)}x</Badge>
        </div>
      </Bento>
    </div>
  );
}
