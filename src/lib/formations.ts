import { FIELD_CENTER_Y, clampToSide, scrimmageLimit } from "./field";
import type {
  CoverageId,
  DefenseFormationId,
  FormationId,
  PlayerDef,
  ZoneAssignment,
} from "./types";

/**
 * Top speeds in yards/second. Roughly calibrated to real personnel: a receiver
 * sustaining ~8.5 yd/s covers 20 yards in a bit over two seconds.
 */
const SPEED = {
  QB: 6.2,
  WR: 8.6,
  RB: 8.0,
  FB: 7.2,
  TE: 7.4,
  C: 6.4,
  DL: 7.0,
  LB: 7.5,
  CB: 8.5,
  S: 8.2,
} as const;

export const FORMATION_LABELS: Record<FormationId, string> = {
  spread: "Spread",
  "i-formation": "I-Formation",
  singleback: "Singleback",
  empty: "Empty Backfield",
};

export const DEFENSE_FORMATION_LABELS: Record<DefenseFormationId, string> = {
  "4-3": "4-3 (2 DL / 2 LB / 3 DB)",
  "3-4": "3-4 (2 DL / 3 LB / 2 DB)",
  nickel: "Nickel (2 DL / 2 LB / 3 DB)",
  dime: "Dime (1 DL / 2 LB / 4 DB)",
  "5-2": "5-2 (3 DL / 2 LB / 2 DB)",
};

export const COVERAGE_LABELS: Record<CoverageId, string> = {
  man: "Man-to-Man",
  "cover-2": "Zone (Cover 2)",
  "cover-3": "Zone (Cover 3)",
};

/**
 * Offensive personnel, as offsets from the line of scrimmage. `dx` is negative
 * into the backfield; `dy` is signed off the field's midline.
 *
 * Every formation fields exactly 7: a centre to snap it, a quarterback, and
 * five skill players distributed per the concept.
 */
interface Slot {
  id: string;
  label: string;
  dx: number;
  dy: number;
  speed: number;
}

/** Receivers align a shade behind the line, outside the neutral zone. */
const ON_LINE = -0.6;

const OFFENSE_SLOTS: Record<FormationId, Slot[]> = {
  // QB, RB, 4 WR, C — four verticals' worth of width.
  spread: [
    { id: "C", label: "C", dx: ON_LINE, dy: 0, speed: SPEED.C },
    { id: "QB", label: "QB", dx: -5, dy: 0, speed: SPEED.QB },
    { id: "RB", label: "RB", dx: -5, dy: 3.2, speed: SPEED.RB },
    { id: "WR1", label: "WR1", dx: ON_LINE, dy: -19, speed: SPEED.WR },
    { id: "WR2", label: "WR2", dx: ON_LINE, dy: 19, speed: SPEED.WR },
    { id: "WR3", label: "WR3", dx: -1.6, dy: -10.5, speed: SPEED.WR },
    { id: "WR4", label: "WR4", dx: -1.6, dy: 10.5, speed: SPEED.WR },
  ],

  // QB under centre, fullback and halfback stacked directly behind him.
  "i-formation": [
    { id: "C", label: "C", dx: ON_LINE, dy: 0, speed: SPEED.C },
    { id: "QB", label: "QB", dx: -1.4, dy: 0, speed: SPEED.QB },
    { id: "FB", label: "FB", dx: -4.5, dy: 0, speed: SPEED.FB },
    { id: "HB", label: "HB", dx: -7.5, dy: 0, speed: SPEED.RB },
    { id: "WR1", label: "WR1", dx: ON_LINE, dy: -20, speed: SPEED.WR },
    { id: "WR2", label: "WR2", dx: ON_LINE, dy: 20, speed: SPEED.WR },
    { id: "TE", label: "TE", dx: ON_LINE, dy: 6, speed: SPEED.TE },
  ],

  // QB under centre, one back, tight end attached, three receivers.
  singleback: [
    { id: "C", label: "C", dx: ON_LINE, dy: 0, speed: SPEED.C },
    { id: "QB", label: "QB", dx: -1.4, dy: 0, speed: SPEED.QB },
    { id: "RB", label: "RB", dx: -6.5, dy: 0, speed: SPEED.RB },
    { id: "WR1", label: "WR1", dx: ON_LINE, dy: -18, speed: SPEED.WR },
    { id: "WR2", label: "WR2", dx: ON_LINE, dy: 18, speed: SPEED.WR },
    { id: "WR3", label: "WR3", dx: -1.6, dy: -10, speed: SPEED.WR },
    { id: "TE", label: "TE", dx: ON_LINE, dy: 6.5, speed: SPEED.TE },
  ],

  // Nobody in the backfield: QB alone with five receivers spread across.
  empty: [
    { id: "C", label: "C", dx: ON_LINE, dy: 0, speed: SPEED.C },
    { id: "QB", label: "QB", dx: -5, dy: 0, speed: SPEED.QB },
    { id: "WR1", label: "WR1", dx: ON_LINE, dy: -20, speed: SPEED.WR },
    { id: "WR2", label: "WR2", dx: ON_LINE, dy: 20, speed: SPEED.WR },
    { id: "WR3", label: "WR3", dx: -1.6, dy: -12, speed: SPEED.WR },
    { id: "WR4", label: "WR4", dx: -1.6, dy: 12, speed: SPEED.WR },
    { id: "WR5", label: "WR5", dx: -1.6, dy: -5.5, speed: SPEED.WR },
  ],
};

/**
 * Defensive personnel, as offsets in front of the line of scrimmage.
 *
 * The brief's own 7-player adjustments give 4-3 and Nickel identical personnel
 * (2 DL / 2 LB / 3 DB), so they are separated by alignment instead, which is
 * what actually distinguishes them: Nickel's extra back widens and deepens to
 * play pass, while the 4-3 keeps its linebackers downhill.
 */
const DEFENSE_SLOTS: Record<DefenseFormationId, Slot[]> = {
  "4-3": [
    { id: "DL1", label: "DL1", dx: 1, dy: -2.2, speed: SPEED.DL },
    { id: "DL2", label: "DL2", dx: 1, dy: 2.2, speed: SPEED.DL },
    { id: "LB1", label: "LB1", dx: 5, dy: -5, speed: SPEED.LB },
    { id: "LB2", label: "LB2", dx: 5, dy: 5, speed: SPEED.LB },
    { id: "CB1", label: "CB1", dx: 6.5, dy: -18, speed: SPEED.CB },
    { id: "CB2", label: "CB2", dx: 6.5, dy: 18, speed: SPEED.CB },
    { id: "FS", label: "FS", dx: 13, dy: 0, speed: SPEED.S },
  ],

  "3-4": [
    { id: "DL1", label: "DL1", dx: 1, dy: -2, speed: SPEED.DL },
    { id: "DL2", label: "DL2", dx: 1, dy: 2, speed: SPEED.DL },
    { id: "LB1", label: "LB1", dx: 4.5, dy: -8, speed: SPEED.LB },
    { id: "LB2", label: "LB2", dx: 5, dy: 0, speed: SPEED.LB },
    { id: "LB3", label: "LB3", dx: 4.5, dy: 8, speed: SPEED.LB },
    { id: "CB1", label: "CB1", dx: 6.5, dy: -18, speed: SPEED.CB },
    { id: "CB2", label: "CB2", dx: 6.5, dy: 18, speed: SPEED.CB },
  ],

  // Same personnel as the 4-3; the nickel back plays off, corners press wide.
  nickel: [
    { id: "DL1", label: "DL1", dx: 1, dy: -2.2, speed: SPEED.DL },
    { id: "DL2", label: "DL2", dx: 1, dy: 2.2, speed: SPEED.DL },
    { id: "LB1", label: "LB1", dx: 6.5, dy: -4, speed: SPEED.LB },
    { id: "LB2", label: "LB2", dx: 6.5, dy: 4, speed: SPEED.LB },
    { id: "CB1", label: "CB1", dx: 5.5, dy: -20, speed: SPEED.CB },
    { id: "CB2", label: "CB2", dx: 5.5, dy: 20, speed: SPEED.CB },
    { id: "NB", label: "NB", dx: 9, dy: -10, speed: SPEED.CB },
  ],

  dime: [
    { id: "DL1", label: "DL1", dx: 1, dy: 0, speed: SPEED.DL },
    { id: "LB1", label: "LB1", dx: 6.5, dy: -4.5, speed: SPEED.LB },
    { id: "LB2", label: "LB2", dx: 6.5, dy: 4.5, speed: SPEED.LB },
    { id: "CB1", label: "CB1", dx: 5.5, dy: -20, speed: SPEED.CB },
    { id: "CB2", label: "CB2", dx: 5.5, dy: 20, speed: SPEED.CB },
    { id: "NB", label: "NB", dx: 9, dy: -10.5, speed: SPEED.CB },
    { id: "FS", label: "FS", dx: 14, dy: 0, speed: SPEED.S },
  ],

  "5-2": [
    { id: "DL1", label: "DL1", dx: 1, dy: -4, speed: SPEED.DL },
    { id: "DL2", label: "DL2", dx: 1, dy: 0, speed: SPEED.DL },
    { id: "DL3", label: "DL3", dx: 1, dy: 4, speed: SPEED.DL },
    { id: "LB1", label: "LB1", dx: 4.5, dy: -6, speed: SPEED.LB },
    { id: "LB2", label: "LB2", dx: 4.5, dy: 6, speed: SPEED.LB },
    { id: "CB1", label: "CB1", dx: 6.5, dy: -18, speed: SPEED.CB },
    { id: "CB2", label: "CB2", dx: 6.5, dy: 18, speed: SPEED.CB },
  ],
};

/** Turns a slot table into players aligned to a given line of scrimmage. */
function place(slots: Slot[], team: "offense" | "defense", losX: number): PlayerDef[] {
  return slots.map((s) => {
    // `dx` already carries its sign: the offense aligns behind the line with
    // negative offsets, the defense in front of it with positive ones.
    const spot = clampToSide(losX + s.dx, FIELD_CENTER_Y + s.dy, team, losX);
    return {
      id: s.id,
      team,
      label: s.label,
      startX: spot.x,
      startY: spot.y,
      speed: s.speed,
    };
  });
}

export function buildFormation(
  formation: FormationId,
  defenseFormation: DefenseFormationId,
  losX: number
): PlayerDef[] {
  return [
    ...place(OFFENSE_SLOTS[formation], "offense", losX),
    ...place(DEFENSE_SLOTS[defenseFormation], "defense", losX),
  ];
}

/** Ids of the offensive players in a formation, in alignment order. */
export function offenseIds(formation: FormationId) {
  return OFFENSE_SLOTS[formation].map((s) => s.id);
}

export function isOffense(id: string, formation: FormationId) {
  return offenseIds(formation).includes(id);
}

/**
 * Man assignments, derived from who is actually on the field rather than a
 * fixed table — personnel now changes with both dropdowns, so a hardcoded map
 * would silently leave defenders uncovered.
 *
 * Corners and the nickel back take the widest receivers; linebackers take
 * what is left inside (tight ends and backs). Deep safeties are deliberately
 * left unassigned: they play centre-field help, which is what a single-high
 * safety actually does in man.
 */
export function manAssignments(players: PlayerDef[]): Record<string, string> {
  const eligible = players
    .filter((p) => p.team === "offense" && p.id !== "C" && p.id !== "QB")
    // Widest first, so the corners claim the outside receivers.
    .sort((a, b) => Math.abs(b.startY - FIELD_CENTER_Y) - Math.abs(a.startY - FIELD_CENTER_Y));

  // Safeties sit out of the rotation; everyone else covers, widest cover first.
  const coverMen = players
    .filter((p) => p.team === "defense" && !isDeepSafety(p.id) && !isLineman(p.id))
    .sort((a, b) => Math.abs(b.startY - FIELD_CENTER_Y) - Math.abs(a.startY - FIELD_CENTER_Y));

  const out: Record<string, string> = {};
  for (let i = 0; i < coverMen.length && i < eligible.length; i++) {
    out[coverMen[i].id] = eligible[i].id;
  }
  return out;
}

function isDeepSafety(id: string) {
  return id === "FS" || id === "SS";
}

function isLineman(id: string) {
  return id.startsWith("DL");
}

/**
 * Zone landmarks per coverage, laid over whichever defensive personnel are on
 * the field. Cover 2 keeps the corners in the flats with the safety over the
 * top; Cover 3 pushes the corners into deep thirds. Linemen rush rather than
 * drop, so they get no landmark and hold at the line.
 */
export function zoneAssignments(
  coverage: CoverageId,
  players: PlayerDef[],
  losX: number
): Record<string, ZoneAssignment> {
  const mid = FIELD_CENTER_Y;
  const deep = coverage === "cover-3";

  const out: Record<string, ZoneAssignment> = {};
  const defenders = players.filter((p) => p.team === "defense" && !isLineman(p.id));

  for (const d of defenders) {
    const side = Math.sign(d.startY - mid) || 1;

    if (isDeepSafety(d.id)) {
      out[d.id] = { x: losX + 19, y: mid, radius: deep ? 10 : 13 };
      continue;
    }

    if (d.id.startsWith("CB") || d.id === "NB") {
      out[d.id] = deep
        ? { x: losX + 17, y: mid + side * 17, radius: 10 }
        : { x: losX + 7, y: mid + side * 17, radius: 8 };
      continue;
    }

    // Linebackers work the short middle and hook zones.
    out[d.id] = { x: losX + (deep ? 8 : 9), y: mid + side * 6, radius: 7 };
  }

  return out;
}

/** Deep-middle landmark the free safety works to when the call is man. */
export function manSafetyHelp(losX: number) {
  return { x: losX + 20, y: FIELD_CENTER_Y };
}

/** True when a defender has no man and no zone, i.e. he rushes the passer. */
export function isPassRusher(id: string) {
  return isLineman(id);
}

/** Where a rusher attacks: the quarterback's alignment. */
export function rushTarget(players: PlayerDef[], losX: number) {
  const qb = players.find((p) => p.id === "QB");
  return qb
    ? { x: qb.startX, y: qb.startY }
    : { x: scrimmageLimit("offense", losX) - 5, y: FIELD_CENTER_Y };
}
