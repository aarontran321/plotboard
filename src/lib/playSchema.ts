import { FIELD_LENGTH, FIELD_WIDTH } from "./field";
import type { CoverageId, FormationId, PlayState, Point } from "./types";

/**
 * Validation for plays crossing a trust boundary.
 *
 * The `plays` table is publicly writable, so anything read back out is
 * untrusted input and gets parsed rather than cast. Malformed rows return null
 * instead of throwing, so a bad share link renders a fresh board rather than a
 * crashed route.
 */

const FORMATIONS: FormationId[] = ["shotgun-spread", "i-formation", "singleback"];
const COVERAGES: CoverageId[] = ["man", "cover-2", "cover-3"];
const TEAMS = ["offense", "defense"];

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

  const formation = input.formation;
  const coverage = input.coverage;
  if (typeof formation !== "string" || !FORMATIONS.includes(formation as FormationId)) return null;
  if (typeof coverage !== "string" || !COVERAGES.includes(coverage as CoverageId)) return null;

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

  return { formation: formation as FormationId, coverage: coverage as CoverageId, players, routes, passTarget };
}

/** Strips the play down to exactly the fields that get persisted. */
export function serializePlayState(play: PlayState) {
  return {
    formation: play.formation,
    coverage: play.coverage,
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
