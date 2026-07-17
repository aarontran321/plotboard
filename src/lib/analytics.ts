/**
 * Live play analytics: derived, read-only numbers computed from a `PlayState`
 * and (optionally) a `SimState` at the current playhead. DOM-free, like
 * `simulation.ts`, so it can be exercised headlessly in `scripts/verify-sim.ts`.
 *
 * Everything here is a genuine computation over real positions — nothing is
 * fabricated or randomised. Where the sim hasn't run yet (`sim === null`),
 * functions either fall back to the pre-snap alignment (so the panel shows
 * something meaningful before Play is pressed) or report a `"PRE-SNAP"` /
 * `null` state, and say so in their return type.
 */

import { dist } from "./field";
import type { PlayState, Point, SimState } from "./types";

/** A player's position right now: live sim position if running, else pre-snap alignment. */
function livePos(play: PlayState, sim: SimState | null, id: string): Point | null {
  if (sim) {
    const ps = sim.players[id];
    return ps ? { x: ps.x, y: ps.y } : null;
  }
  const p = play.players.find((pp) => pp.id === id);
  return p ? { x: p.startX, y: p.startY } : null;
}

export interface TimeToThrow {
  /** Seconds from the snap to release — still counting up if the ball hasn't gone yet. */
  seconds: number;
  /** False while still counting up pre-release. */
  released: boolean;
}

/** Below this, a quick, safe release. Above `DANGER`, the pocket has collapsed. */
export const TTT_WARN_S = 1.8;
export const TTT_DANGER_S = 2.5;

export type TimeToThrowTier = "safe" | "warning" | "danger";

export function timeToThrowTier(seconds: number): TimeToThrowTier {
  if (seconds > TTT_DANGER_S) return "danger";
  if (seconds > TTT_WARN_S) return "warning";
  return "safe";
}

/**
 * Time to throw. `ball.elapsed` freezes the instant the ball lands (see
 * `stepSim` in `simulation.ts` — it stops advancing once `phase !== "flight"`),
 * so `(landedAt ?? t) - elapsed` is the release time both during the flight
 * (where it's constant, since `t` and `elapsed` advance in lockstep) and after
 * landing (where only `t` keeps advancing through the settle window).
 */
export function timeToThrow(sim: SimState | null): TimeToThrow | null {
  if (!sim) return null;
  if (!sim.ball) return { seconds: sim.t, released: false };
  const referenceT = sim.landedAt ?? sim.t;
  return { seconds: referenceT - sim.ball.elapsed, released: true };
}

/**
 * The receiver the play is actually designed to go to: the placed pass
 * target if there is one, else whichever offensive skill player has the
 * longest drawn route (a reasonable stand-in for "who this play is for"
 * before a target has been placed).
 */
export function primaryReceiverId(play: PlayState): string | null {
  if (play.passTarget?.receiverId) return play.passTarget.receiverId;

  let best: { id: string; length: number } | null = null;
  for (const [id, pts] of Object.entries(play.routes)) {
    if (id === "QB" || !pts || pts.length < 2) continue;
    let length = 0;
    for (let i = 1; i < pts.length; i++) {
      length += dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    }
    if (!best || length > best.length) best = { id, length };
  }
  return best?.id ?? null;
}

export interface ReceiverTracking {
  receiverId: string;
  /** Yards downfield of the line of scrimmage — negative behind it. */
  depth: number;
  /** Yards to the nearest defender; `Infinity` if there is no defense on the field. */
  separation: number;
  nearestDefenderId: string | null;
}

/** Route depth and separation for the primary receiver, at the current frame. */
export function routeDepthAndSeparation(play: PlayState, sim: SimState | null): ReceiverTracking | null {
  const receiverId = primaryReceiverId(play);
  if (!receiverId) return null;
  const pos = livePos(play, sim, receiverId);
  if (!pos) return null;

  let nearest: { id: string; d: number } | null = null;
  for (const p of play.players) {
    if (p.team !== "defense") continue;
    const dp = livePos(play, sim, p.id);
    if (!dp) continue;
    const d = dist(pos.x, pos.y, dp.x, dp.y);
    if (!nearest || d < nearest.d) nearest = { id: p.id, d };
  }

  return {
    receiverId,
    depth: pos.x - play.losX,
    separation: nearest?.d ?? Infinity,
    nearestDefenderId: nearest?.id ?? null,
  };
}

export type CoverageStatus = "PRE-SNAP" | "MAN-LOCK" | "MISMATCH DETECTED" | "ZONE BROKEN" | "ZONE SET";

/**
 * A separation wider than this in man coverage means the defender has lost
 * his man — a mismatch, not a mistake in the data.
 */
const MAN_MISMATCH_YD = 3.5;
/** Zone defenders play off-coverage by design, so the break threshold is looser. */
const ZONE_BROKEN_YD = 5;

/**
 * A small, honest, rule-based read on coverage integrity — not a claim of
 * NFL-grade route-recognition analytics. It only knows one thing: how far the
 * primary receiver has separated from the nearest defender, read against a
 * threshold appropriate to the coverage actually called.
 */
export function coverageStatus(play: PlayState, sim: SimState | null): CoverageStatus {
  if (!sim) return "PRE-SNAP";
  const info = routeDepthAndSeparation(play, sim);
  if (!info || !Number.isFinite(info.separation)) return "PRE-SNAP";

  if (play.coverage === "man") {
    return info.separation > MAN_MISMATCH_YD ? "MISMATCH DETECTED" : "MAN-LOCK";
  }
  return info.separation > ZONE_BROKEN_YD ? "ZONE BROKEN" : "ZONE SET";
}
