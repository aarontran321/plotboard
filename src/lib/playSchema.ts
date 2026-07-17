import { FIELD_LENGTH, FIELD_WIDTH, LOS_MAX_X, LOS_MIN_X, LOS_X } from "./field";
import { MAX_PLAY_NAME_LENGTH } from "./playName";
import type {
  CoverageId,
  DefenseFormationId,
  FormationId,
  PlayState,
  Point,
} from "./types";

/**
 * Validation for plays crossing a trust boundary.
 *
 * The `plays` table is publicly writable, so anything read back out is
 * untrusted input and gets parsed rather than cast. Malformed rows return null
 * instead of throwing, so a bad share link renders a fresh board rather than a
 * crashed route.
 */

const FORMATIONS: FormationId[] = ["spread", "i-formation", "singleback", "empty"];
const DEFENSE_FORMATIONS: DefenseFormationId[] = ["4-3", "3-4", "nickel", "dime", "5-2"];
const COVERAGES: CoverageId[] = ["man", "cover-2", "cover-3"];
const TEAMS = ["offense", "defense"];

/**
 * Formation ids that have been renamed. Links shared before the 7v7 rework
 * carry the old id; the roster in those payloads is stale, but the players are
 * serialized with the play, so the board still renders what was shared.
 */
const LEGACY_FORMATIONS: Record<string, FormationId> = {
  "shotgun-spread": "spread",
};

/** Defaults for fields added after plays were already being shared. */
const DEFAULT_DEFENSE_FORMATION: DefenseFormationId = "4-3";

/** Caps on size, so a hostile payload cannot wedge the renderer. */
const MAX_PLAYERS = 24;
const MAX_ROUTE_POINTS = 400;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finiteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function parsePoint(v: unknown): Point | null {
  if (!isRecord(v)) return null;
  if (!finiteInRange(v.x, 0, FIELD_LENGTH) || !finiteInRange(v.y, 0, FIELD_WIDTH)) return null;
  return { x: v.x, y: v.y };
}

export function parsePlayState(input: unknown): PlayState | null {
  if (!isRecord(input)) return null;

  if (typeof input.formation !== "string") return null;
  const formation = (LEGACY_FORMATIONS[input.formation] ?? input.formation) as FormationId;
  if (!FORMATIONS.includes(formation)) return null;

  const coverage = input.coverage;
  if (typeof coverage !== "string" || !COVERAGES.includes(coverage as CoverageId)) return null;

  // Added after launch: absent on plays shared before defensive personnel was
  // selectable, so it defaults rather than rejecting the whole play.
  let defenseFormation: DefenseFormationId = DEFAULT_DEFENSE_FORMATION;
  if (input.defenseFormation !== undefined) {
    if (
      typeof input.defenseFormation !== "string" ||
      !DEFENSE_FORMATIONS.includes(input.defenseFormation as DefenseFormationId)
    ) {
      return null;
    }
    defenseFormation = input.defenseFormation as DefenseFormationId;
  }

  // Likewise for the line of scrimmage, which used to be a constant.
  let losX = LOS_X;
  if (input.losX !== undefined) {
    if (!finiteInRange(input.losX, LOS_MIN_X, LOS_MAX_X)) return null;
    losX = input.losX;
  }

  // An unnamed play is legitimate — the default name is derived at the point of
  // use, not stored — so absent and empty both mean "unnamed". A name that is
  // present but not a string, or over the cap, is malformed.
  let name = "";
  if (input.name !== undefined && input.name !== null) {
    if (typeof input.name !== "string" || input.name.length > MAX_PLAY_NAME_LENGTH) return null;
    name = input.name;
  }

  if (!Array.isArray(input.players) || input.players.length === 0) return null;
  if (input.players.length > MAX_PLAYERS) return null;

  const players: PlayState["players"] = [];
  for (const raw of input.players) {
    if (!isRecord(raw)) return null;
    const { id, team, label, startX, startY, speed } = raw;
    if (typeof id !== "string" || id.length === 0 || id.length > 8) return null;
    if (typeof team !== "string" || !TEAMS.includes(team)) return null;
    if (typeof label !== "string" || label.length === 0 || label.length > 8) return null;
    if (!finiteInRange(startX, 0, FIELD_LENGTH)) return null;
    if (!finiteInRange(startY, 0, FIELD_WIDTH)) return null;
    if (!finiteInRange(speed, 0, 20)) return null;
    players.push({ id, team: team as "offense" | "defense", label, startX, startY, speed });
  }

  const playerIds = new Set(players.map((p) => p.id));
  if (playerIds.size !== players.length) return null;

  const routes: PlayState["routes"] = {};
  if (input.routes !== undefined) {
    if (!isRecord(input.routes)) return null;
    for (const [id, pts] of Object.entries(input.routes)) {
      if (!playerIds.has(id)) return null;
      if (!Array.isArray(pts) || pts.length > MAX_ROUTE_POINTS) return null;
      const parsed: Point[] = [];
      for (const p of pts) {
        const point = parsePoint(p);
        if (!point) return null;
        parsed.push(point);
      }
      routes[id] = parsed;
    }
  }

  let passTarget: PlayState["passTarget"] = null;
  if (input.passTarget !== undefined && input.passTarget !== null) {
    const t = input.passTarget;
    if (!isRecord(t)) return null;
    const point = parsePoint(t);
    if (!point) return null;
    if (typeof t.receiverId !== "string" || !playerIds.has(t.receiverId)) return null;
    if (!finiteInRange(t.t, 0, 1)) return null;
    passTarget = { x: point.x, y: point.y, receiverId: t.receiverId, t: t.t };
  }

  return {
    name,
    formation,
    defenseFormation,
    coverage: coverage as CoverageId,
    losX,
    players,
    routes,
    passTarget,
  };
}

/** Strips the play down to exactly the fields that get persisted. */
export function serializePlayState(play: PlayState) {
  return {
    name: play.name,
    formation: play.formation,
    defenseFormation: play.defenseFormation,
    coverage: play.coverage,
    losX: play.losX,
    players: play.players.map((p) => ({
      id: p.id,
      team: p.team,
      label: p.label,
      startX: p.startX,
      startY: p.startY,
      speed: p.speed,
    })),
    routes: play.routes,
    passTarget: play.passTarget,
  };
}
