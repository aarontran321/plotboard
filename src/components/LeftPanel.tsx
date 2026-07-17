"use client";

import { COVERAGE_LABELS, FORMATION_LABELS } from "@/lib/formations";
import type { CoverageId, FormationId } from "@/lib/types";
import { Badge, Button, Panel, Section } from "./ui";

interface Props {
  formation: FormationId;
  coverage: CoverageId;
  speed: number;
  isPlaying: boolean;
  disabled: boolean;
  onFormation: (f: FormationId) => void;
  onCoverage: (c: CoverageId) => void;
  onSpeed: (s: number) => void;
  onTogglePlay: () => void;
  onReset: () => void;
}

const FORMATIONS = Object.keys(FORMATION_LABELS) as FormationId[];
const COVERAGES = Object.keys(COVERAGE_LABELS) as CoverageId[];

export default function LeftPanel({
  formation,
  coverage,
  speed,
  isPlaying,
  disabled,
  onFormation,
  onCoverage,
  onSpeed,
  onTogglePlay,
  onReset,
}: Props) {
  return (
    <Panel>
      <Section title="Formation">
        <div className="flex flex-col gap-1.5">
          {FORMATIONS.map((f) => (
            <Button
              key={f}
              active={formation === f}
              disabled={disabled}
              onClick={() => onFormation(f)}
              className="text-left"
            >
              {FORMATION_LABELS[f]}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Defensive Coverage">
        <div className="flex flex-col gap-1.5">
          {COVERAGES.map((c) => (
            <Button
              key={c}
              active={coverage === c}
              disabled={disabled}
              onClick={() => onCoverage(c)}
              className="text-left"
            >
              {COVERAGE_LABELS[c]}
            </Button>
          ))}
        </div>
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

      <Section title="Playback">
        <div className="flex flex-col gap-1.5">
          <Button variant="primary" disabled={disabled} onClick={onTogglePlay}>
            {isPlaying ? "Pause Play" : "Simulate Play"}
          </Button>
          <Button disabled={disabled} onClick={onReset}>
            Reset Field
          </Button>
        </div>
      </Section>
    </Panel>
  );
}
