"use client";

import type { FieldTheme } from "@/lib/field";
import {
  COVERAGE_LABELS,
  DEFENSE_FORMATION_LABELS,
  FORMATION_LABELS,
} from "@/lib/formations";
import type { CoverageId, DefenseFormationId, FormationId } from "@/lib/types";
import { Bento, Button, Divider, Fieldset, Segmented, Select } from "./ui";

interface Props {
  formation: FormationId;
  defenseFormation: DefenseFormationId;
  coverage: CoverageId;
  drawMode: boolean;
  isPlacingPassTarget: boolean;
  theme: FieldTheme;
  disabled: boolean;
  /** True while playback or export blocks arming the Pass Target Tool. */
  passTargetDisabled: boolean;
  onFormation: (f: FormationId) => void;
  onDefenseFormation: (d: DefenseFormationId) => void;
  onCoverage: (c: CoverageId) => void;
  onDrawMode: (on: boolean) => void;
  onTogglePlacingPassTarget: () => void;
  onTheme: (t: FieldTheme) => void;
}

const FORMATIONS = Object.keys(FORMATION_LABELS) as FormationId[];
const DEFENSE_FORMATIONS = Object.keys(DEFENSE_FORMATION_LABELS) as DefenseFormationId[];
const COVERAGES = Object.keys(COVERAGE_LABELS) as CoverageId[];

/** Compact segment captions — the full names live in the dropdowns/tooltips. */
const COVERAGE_SHORT: Record<CoverageId, string> = {
  man: "Man",
  "cover-2": "Cover 2",
  "cover-3": "Cover 3",
};

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
  drawMode,
  isPlacingPassTarget,
  theme,
  disabled,
  passTargetDisabled,
  onFormation,
  onDefenseFormation,
  onCoverage,
  onDrawMode,
  onTogglePlacingPassTarget,
  onTheme,
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Bento title="Matchup">
        <Fieldset label="Offense">
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
        </Fieldset>

        <Fieldset label="Defense">
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
        </Fieldset>

        <Fieldset label="Coverage">
          <Segmented
            value={coverage}
            disabled={disabled}
            ariaLabel="Defensive coverage"
            onChange={onCoverage}
            options={COVERAGES.map((c) => ({
              value: c,
              label: <span title={COVERAGE_LABELS[c]}>{COVERAGE_SHORT[c]}</span>,
            }))}
          />
        </Fieldset>
      </Bento>

      <Bento title="Tools">
        <Fieldset label="Interaction">
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
        </Fieldset>

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
          {isPlacingPassTarget ? "Placing Target… (Esc)" : "Set Pass Target"}
        </Button>

        <p className="text-[11px] leading-snug text-[#71717A]">
          {drawMode
            ? "Drag from a player to draw their route. Press D to move."
            : "Drag players to reposition. D draws routes, P sets a target."}
        </p>

        <Divider className="my-0.5" />

        <Fieldset label="Field Style">
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
        </Fieldset>
      </Bento>
    </div>
  );
}
