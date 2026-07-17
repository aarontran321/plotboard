import { FIELD_CENTER_Y, LOS_X } from "./field";
import type { CoverageId, FormationId, PlayerDef, ZoneAssignment } from "./types";

/**
 * Top speeds in yards/second. Roughly calibrated to real personnel: a receiver
 * sustaining ~8.5 yd/s covers 20 yards in a bit over two seconds.
 */
const SPEED = {
  QB: 6.2,
  WR: 8.6,
  RB: 8.0,
  TE: 7.4,
  CB: 8.5,
  FS: 8.2,
  MLB: 7.4,
  OLB: 7.6,
} as const;

/** Receivers align just behind the line of scrimmage. */
const ON_LINE = LOS_X - 0.6;

export const FORMATION_LABELS: Record<FormationId, string> = {
  "shotgun-spread": "Shotgun Spread",
  "i-formation": "I-Formation",
  singleback: "Singleback",
};

export const COVERAGE_LABELS: Record<CoverageId, string> = {
  man: "Man-to-Man",
  "cover-2": "Zone (Cover 2)",
  "cover-3": "Zone (Cover 3)",
};

function offense(formation: FormationId): PlayerDef[] {
  const mid = FIELD_CENTER_Y;

  switch (formation) {
    case "shotgun-spread":
      return [
        { id: "QB", team: "offense", label: "QB", startX: LOS_X - 5, startY: mid, speed: SPEED.QB },
        { id: "RB", team: "offense", label: "RB", startX: LOS_X - 5, startY: mid + 3.2, speed: SPEED.RB },
        { id: "WR1", team: "offense", label: "WR1", startX: ON_LINE, startY: mid - 19, speed: SPEED.WR },
        { id: "WR2", team: "offense", label: "WR2", startX: ON_LINE, startY: mid + 19, speed: SPEED.WR },
        { id: "TE", team: "offense", label: "TE", startX: ON_LINE, startY: mid - 7.5, speed: SPEED.TE },
      ];

    case "i-formation":
      return [
        { id: "QB", team: "offense", label: "QB", startX: LOS_X - 1.4, startY: mid, speed: SPEED.QB },
        { id: "RB", team: "offense", label: "RB", startX: LOS_X - 7.5, startY: mid, speed: SPEED.RB },
        { id: "WR1", team: "offense", label: "WR1", startX: ON_LINE, startY: mid - 20, speed: SPEED.WR },
        { id: "WR2", team: "offense", label: "WR2", startX: ON_LINE, startY: mid + 20, speed: SPEED.WR },
        { id: "TE", team: "offense", label: "TE", startX: ON_LINE, startY: mid + 6, speed: SPEED.TE },
      ];

    case "singleback":
      return [
        { id: "QB", team: "offense", label: "QB", startX: LOS_X - 1.4, startY: mid, speed: SPEED.QB },
        { id: "RB", team: "offense", label: "RB", startX: LOS_X - 6.5, startY: mid, speed: SPEED.RB },
        { id: "WR1", team: "offense", label: "WR1", startX: ON_LINE, startY: mid - 18, speed: SPEED.WR },
        { id: "WR2", team: "offense", label: "WR2", startX: ON_LINE, startY: mid + 18, speed: SPEED.WR },
        { id: "TE", team: "offense", label: "TE", startX: ON_LINE, startY: mid + 6.5, speed: SPEED.TE },
      ];
  }
}

/** Defenders line up relative to the offensive players they are responsible for. */
function defense(off: PlayerDef[]): PlayerDef[] {
  const find = (id: string) => off.find((p) => p.id === id)!;
  const wr1 = find("WR1");
  const wr2 = find("WR2");
  const te = find("TE");

  return [
    { id: "CB1", team: "defense", label: "CB1", startX: LOS_X + 6.5, startY: wr1.startY + 1, speed: SPEED.CB },
    { id: "CB2", team: "defense", label: "CB2", startX: LOS_X + 6.5, startY: wr2.startY - 1, speed: SPEED.CB },
    { id: "FS", team: "defense", label: "FS", startX: LOS_X + 13, startY: FIELD_CENTER_Y, speed: SPEED.FS },
    { id: "MLB", team: "defense", label: "MLB", startX: LOS_X + 5, startY: FIELD_CENTER_Y, speed: SPEED.MLB },
    { id: "OLB", team: "defense", label: "OLB", startX: LOS_X + 4.5, startY: te.startY + 2, speed: SPEED.OLB },
  ];
}

export function buildFormation(formation: FormationId): PlayerDef[] {
  const off = offense(formation);
  return [...off, ...defense(off)];
}

/**
 * Man coverage assignments: defender id -> the offensive player they shadow.
 * The free safety is deliberately absent; it plays deep middle help instead,
 * which is how a real single-high safety behaves in man.
 */
export const MAN_ASSIGNMENTS: Record<string, string> = {
  CB1: "WR1",
  CB2: "WR2",
  OLB: "TE",
  MLB: "RB",
};

/**
 * Zone landmarks per coverage. Cover 2 keeps the corners in the flats with the
 * safety over the top; Cover 3 pushes the corners into deep thirds.
 */
export function zoneAssignments(coverage: CoverageId): Record<string, ZoneAssignment> {
  const mid = FIELD_CENTER_Y;

  if (coverage === "cover-2") {
    return {
      CB1: { x: LOS_X + 7, y: mid - 17, radius: 8 },
      CB2: { x: LOS_X + 7, y: mid + 17, radius: 8 },
      FS: { x: LOS_X + 19, y: mid, radius: 13 },
      MLB: { x: LOS_X + 9, y: mid - 1, radius: 7 },
      OLB: { x: LOS_X + 9, y: mid + 8, radius: 7 },
    };
  }

  // Cover 3
  return {
    CB1: { x: LOS_X + 17, y: mid - 17, radius: 10 },
    CB2: { x: LOS_X + 17, y: mid + 17, radius: 10 },
    FS: { x: LOS_X + 19, y: mid, radius: 10 },
    MLB: { x: LOS_X + 8, y: mid - 3, radius: 7 },
    OLB: { x: LOS_X + 8, y: mid + 9, radius: 7 },
  };
}

/** Deep-middle landmark the free safety works to when the call is man. */
export const MAN_SAFETY_HELP = { x: LOS_X + 20, y: FIELD_CENTER_Y };

export function isOffense(id: string) {
  return ["QB", "WR1", "WR2", "RB", "TE"].includes(id);
}
