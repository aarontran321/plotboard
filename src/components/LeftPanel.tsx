"use client";

import type { FieldTheme } from "@/lib/field";
import {
  COVERAGE_LABELS,
  DEFENSE_FORMATION_LABELS,
  FORMATION_LABELS,
} from "@/lib/formations";
import type { CoverageId, DefenseFormationId, FormationId } from "@/lib/types";
import { Badge, Bento, Button, Segmented, Select } from "./ui";

interface Props {
  formation: FormationId;
  defenseFormation: DefenseFormationId;
  coverage: CoverageId;
  speed: number;
  drawMode: boolean;
  isPlacingPassTarget: boolean;
  theme: FieldTheme;
  disabled: boolean;
  /** True while playback or export blocks arming the Pass Target Tool. */
  passTargetDisabled: boolean;
  onFormation: (f: FormationId) => void;
  onDefenseFormation: (d: DefenseFormationId) => void;
  onCoverage: (c: CoverageId) => void;
  onSpeed: (s: number) => void;
  onDrawMode: (on: boolean) => void;
  onTogglePlacingPassTarget: () => void;
  onTheme: (t: FieldTheme) => void;
}

const FORMATIONS = Object.keys(FORMATION_LABELS) as FormationId[];
const DEFENSE_FORMATIONS = Object.keys(DEFENSE_FORMATION_LABELS) as DefenseFormationId[];
const COVERAGES = Object.keys(COVERAGE_LABELS) as CoverageId[];

function CrosshairIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 0.5v3.2M8 12.3v3.2M0.5 8h3.2M12.3 8h3.2" strokeLinecap="round" />
    </svg>
  );
}

export default function LeftPanel({
  formation,
  defenseFormation,
  coverage,
  speed,
  drawMode,
  isPlacingPassTarget,
  theme,
  disabled,
  passTargetDisabled,
  onFormation,
  onDefenseFormation,
  onCoverage,
  onSpeed,
  onDrawMode,
  onTogglePlacingPassTarget,
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
        <Button
          active={isPlacingPassTarget}
          disabled={passTargetDisabled}
          onClick={onTogglePlacingPassTarget}
          aria-pressed={isPlacingPassTarget}
          aria-label="Set pass target (P)"
          title="Set pass target (P) — selects the QB and arms the targeting tool"
          className="flex w-full items-center justify-center gap-2"
        >
          <CrosshairIcon />
          {isPlacingPassTarget ? "Placing Target… (Esc)" : "Set Pass Target (P)"}
        </Button>
        <p className="text-[11px] leading-snug text-[#A1A1AA]">
          Arms the Pass Target Tool — selects the QB automatically. Press P anytime.
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
