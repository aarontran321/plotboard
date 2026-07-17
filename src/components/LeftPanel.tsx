"use client";

import {
  COVERAGE_LABELS,
  DEFENSE_FORMATION_LABELS,
  FORMATION_LABELS,
} from "@/lib/formations";
import type { CoverageId, DefenseFormationId, FormationId } from "@/lib/types";
import { Badge, Button, Panel, Section, Select } from "./ui";

interface Props {
  formation: FormationId;
  defenseFormation: DefenseFormationId;
  coverage: CoverageId;
  speed: number;
  drawMode: boolean;
  disabled: boolean;
  onFormation: (f: FormationId) => void;
  onDefenseFormation: (d: DefenseFormationId) => void;
  onCoverage: (c: CoverageId) => void;
  onSpeed: (s: number) => void;
  onDrawMode: (on: boolean) => void;
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
  disabled,
  onFormation,
  onDefenseFormation,
  onCoverage,
  onSpeed,
  onDrawMode,
}: Props) {
  return (
    <Panel>
      <Section title="Offense Formation">
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
      </Section>

      <Section title="Defense Formation">
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
      </Section>

      <Section title="Defensive Coverage">
        <Select
          value={coverage}
          disabled={disabled}
          aria-label="Defensive coverage"
          onChange={(e) => onCoverage(e.target.value as CoverageId)}
        >
          {COVERAGES.map((c) => (
            <option key={c} value={c}>
              {COVERAGE_LABELS[c]}
            </option>
          ))}
        </Select>
      </Section>

      <Section title="Tool">
        <Button
          active={drawMode}
          disabled={disabled}
          onClick={() => onDrawMode(!drawMode)}
          aria-pressed={drawMode}
        >
          {drawMode ? "Draw Route Mode: On" : "Draw Route Mode: Off"}
        </Button>
        <p className="text-[11px] leading-snug text-[#6B7280]">
          {drawMode
            ? "Drag from a selected offensive player to draw their route. Press D to go back to moving players."
            : "Drag players to reposition them. Press D to draw routes instead."}
        </p>
      </Section>

      <Section title="Simulation Speed">
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
            className="h-1 flex-1 cursor-pointer appearance-none bg-[#374151] accent-[#2563EB] disabled:cursor-not-allowed disabled:opacity-40"
          />
          <Badge>{speed.toFixed(1)}x</Badge>
        </div>
      </Section>
    </Panel>
  );
}
