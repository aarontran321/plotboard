import { CATCH_RADIUS, clampToField, dist } from "./field";
import { MAN_ASSIGNMENTS, MAN_SAFETY_HELP, zoneAssignments } from "./formations";
import { flattenPath, moveToward, pointAtDistance, type FlatPath } from "./geometry";
import type { Outcome, PlayState, Point, SimState, ZoneAssignment } from "./types";

/** Gravity in yards/second^2 (32.174 ft/s^2 converted from feet). */
const GRAVITY = 32.174 / 3;

/** Horizontal ball velocity for a throw, in yards/second. */
const BALL_SPEED = 19;

/** The quarterback releases once the target receiver is this far into the route. */
const THROW_TRIGGER_T = 0.3;

/**
 * Defenders in man coverage react to where the receiver *was*, not where they
 * are. This is what makes a sharp break create separation.
 */
const TRACK_LATENCY = 0.25;

/** How close the ball must land for a defender to break on it. */
const BREAK_ON_BALL_RADIUS = 14;

/** Seconds of trail history to keep per player. */
const TRAIL_WINDOW = 1.0;

/** The play is dead after this long, even if nothing resolved. */
const MAX_PLAY_TIME = 12;

/** Seconds the outcome banner holds before the sim reports itself finished. */
const SETTLE_TIME = 1.2;

/**
 * Precomputed, per-play data that does not change while the sim runs. Flattening
 * routes once here keeps the per-frame step allocation-free.
 */
export interface SimContext {
  play: PlayState;
  paths: Record<string, FlatPath>;
  zones: Record<string, ZoneAssignment>;
}

export function createContext(play: PlayState): SimContext {
  const paths: Record<string, FlatPath> = {};
  for (const [id, pts] of Object.entries(play.routes)) {
    if (pts && pts.length >= 2) paths[id] = flattenPath(pts);
  }
  return {
    play,
    paths,
    zones: play.coverage === "man" ? {} : zoneAssignments(play.coverage),
  };
}

export function createInitialSim(ctx: SimContext): SimState {
  const players: SimState["players"] = {};
  for (const p of ctx.play.players) {
    players[p.id] = {
      x: p.startX,
      y: p.startY,
      dist: 0,
      trail: [{ t: 0, x: p.startX, y: p.startY }],
    };
  }
  return { t: 0, players, ball: null, outcome: null, landedAt: null, finished: false };
}

/** Where a player was `TRACK_LATENCY` seconds ago, for defensive pursuit. */
function sampleTrail(trail: { t: number; x: number; y: number }[], targetT: number): Point {
  if (trail.length === 0) return { x: 0, y: 0 };
  for (let i = trail.length - 1; i >= 0; i--) {
    if (trail[i].t <= targetT) return { x: trail[i].x, y: trail[i].y };
  }
  return { x: trail[0].x, y: trail[0].y };
}

/** How deep the quarterback drops when no explicit route is drawn for him. */
function dropDepth(ctx: SimContext) {
  return ctx.play.formation === "shotgun-spread" ? 2 : 5;
}

function advanceAlongRoute(
  sim: SimState,
  ctx: SimContext,
  id: string,
  speed: number,
  dt: number
): boolean {
  const path = ctx.paths[id];
  if (!path || path.length === 0) return false;

  const ps = sim.players[id];
  ps.dist = Math.min(path.length, ps.dist + speed * dt);
  const p = pointAtDistance(path, ps.dist);
  ps.x = p.x;
  ps.y = p.y;
  return true;
}

/** Normalized progress along a player's route, or 0 if they have none. */
export function routeProgress(sim: SimState, ctx: SimContext, id: string): number {
  const path = ctx.paths[id];
  if (!path || path.length === 0) return 0;
  return sim.players[id].dist / path.length;
}

function stepOffense(sim: SimState, ctx: SimContext, dt: number) {
  const landing = sim.ball ? sim.ball.to : null;
  const targetId = ctx.play.passTarget?.receiverId ?? null;

  for (const p of ctx.play.players) {
    if (p.team !== "offense") continue;
    const ps = sim.players[p.id];
    const path = ctx.paths[p.id];
    const routeDone = !path || ps.dist >= path.length;

    // The intended receiver peels off to the landing spot once the ball is up
    // and their route has played out.
    if (sim.ball?.phase === "flight" && p.id === targetId && routeDone && landing) {
      const next = moveToward(ps, landing, p.speed * dt);
      ps.x = next.x;
      ps.y = next.y;
      continue;
    }

    if (advanceAlongRoute(sim, ctx, p.id, p.speed, dt)) continue;

    // No route: the quarterback drops back and sets, everyone else holds.
    if (p.id === "QB") {
      const spot = { x: p.startX - dropDepth(ctx), y: p.startY };
      const next = moveToward(ps, spot, p.speed * 0.8 * dt);
      ps.x = next.x;
      ps.y = next.y;
    }
  }
}

function stepDefense(sim: SimState, ctx: SimContext, dt: number) {
  const lookback = sim.t - TRACK_LATENCY;
  const landing = sim.ball?.phase === "flight" ? sim.ball.to : null;
  const offensivePlayers = ctx.play.players.filter((p) => p.team === "offense");

  for (const p of ctx.play.players) {
    if (p.team !== "defense") continue;
    const ps = sim.players[p.id];

    // Break on the ball: once it is in the air, anyone close enough to the
    // landing spot abandons their assignment and attacks the catch point.
    if (landing && dist(ps.x, ps.y, landing.x, landing.y) < BREAK_ON_BALL_RADIUS) {
      const next = moveToward(ps, landing, p.speed * dt);
      ps.x = next.x;
      ps.y = next.y;
      continue;
    }

    let spot: Point;

    if (ctx.play.coverage === "man") {
      const assignedId = MAN_ASSIGNMENTS[p.id];
      if (assignedId && sim.players[assignedId]) {
        spot = sampleTrail(sim.players[assignedId].trail, lookback);
      } else {
        // The free safety has no man; he works to deep middle help.
        spot = MAN_SAFETY_HELP;
      }
    } else {
      const zone = ctx.zones[p.id];
      spot = zone ? { x: zone.x, y: zone.y } : { x: ps.x, y: ps.y };

      // Zone defenders sit on their landmark until a receiver threatens it,
      // then drive on the nearest threat.
      if (zone) {
        let nearest: { id: string; d: number } | null = null;
        for (const off of offensivePlayers) {
          const os = sim.players[off.id];
          const d = dist(os.x, os.y, zone.x, zone.y);
          if (d <= zone.radius && (!nearest || d < nearest.d)) nearest = { id: off.id, d };
        }
        if (nearest) spot = sampleTrail(sim.players[nearest.id].trail, lookback);
      }
    }

    const next = moveToward(ps, spot, p.speed * dt);
    ps.x = next.x;
    ps.y = next.y;
  }
}

function releaseBall(sim: SimState, ctx: SimContext) {
  const target = ctx.play.passTarget!;
  const qb = sim.players["QB"];
  const from = { x: qb.x, y: qb.y };
  const to = { x: target.x, y: target.y };
  const d = dist(from.x, from.y, to.x, to.y);

  sim.ball = {
    phase: "flight",
    x: from.x,
    y: from.y,
    z: 0,
    from,
    to,
    elapsed: 0,
    duration: Math.max(0.35, Math.min(2.6, d / BALL_SPEED)),
  };
}

function resolveOutcome(sim: SimState, ctx: SimContext): Outcome {
  const landing = sim.ball!.to;

  let best: { team: string; d: number } | null = null;
  for (const p of ctx.play.players) {
    const ps = sim.players[p.id];
    const d = dist(ps.x, ps.y, landing.x, landing.y);
    if (!best || d < best.d) best = { team: p.team, d };
  }

  if (!best || best.d > CATCH_RADIUS) return "Incomplete Pass";
  return best.team === "defense" ? "Intercepted!" : "Pass Completed!";
}

function stepBall(sim: SimState, ctx: SimContext, dt: number) {
  const target = ctx.play.passTarget;

  if (!sim.ball) {
    if (!target || !sim.players["QB"]) return;
    // Hold the ball until the intended receiver has run enough of the route.
    if (routeProgress(sim, ctx, target.receiverId) >= THROW_TRIGGER_T) releaseBall(sim, ctx);
    return;
  }

  if (sim.ball.phase !== "flight") return;

  const ball = sim.ball;
  ball.elapsed += dt;
  const f = Math.min(1, ball.elapsed / ball.duration);

  ball.x = ball.from.x + (ball.to.x - ball.from.x) * f;
  ball.y = ball.from.y + (ball.to.y - ball.from.y) * f;

  // Vertical launch velocity chosen so the ball returns to z = 0 exactly at
  // `duration`: z(t) = v0*t - g*t^2/2, with z(duration) = 0.
  const v0 = 0.5 * GRAVITY * ball.duration;
  ball.z = Math.max(0, v0 * ball.elapsed - 0.5 * GRAVITY * ball.elapsed * ball.elapsed);

  if (f >= 1) {
    ball.phase = "landed";
    ball.z = 0;
    sim.outcome = resolveOutcome(sim, ctx);
    sim.landedAt = sim.t;
  }
}

/** Advances the simulation by `dt` seconds. Mutates `sim` in place. */
export function stepSim(sim: SimState, ctx: SimContext, dt: number) {
  if (sim.finished) return;

  sim.t += dt;

  // Once the ball is down the play is dead, so nobody moves again. Beyond
  // being what a whistle means, this keeps the final frame consistent with the
  // outcome resolved at the catch point, and avoids a receiver who broke off
  // his route to chase the ball snapping back onto the path afterwards.
  if (sim.landedAt === null) {
    stepOffense(sim, ctx, dt);

    // Record trails after offense moves but before defense reads them, so
    // defenders are always chasing a stale sample.
    for (const p of ctx.play.players) {
      const ps = sim.players[p.id];
      const clamped = clampToField(ps.x, ps.y);
      ps.x = clamped.x;
      ps.y = clamped.y;
      ps.trail.push({ t: sim.t, x: ps.x, y: ps.y });
      while (ps.trail.length > 2 && ps.trail[0].t < sim.t - TRAIL_WINDOW) ps.trail.shift();
    }

    stepDefense(sim, ctx, dt);
  }

  stepBall(sim, ctx, dt);

  // Let the outcome banner breathe before reporting the play as over.
  const settled = sim.landedAt !== null && sim.t - sim.landedAt > SETTLE_TIME;
  if (settled || sim.t > MAX_PLAY_TIME) sim.finished = true;
}

/** Total wall-clock seconds a play needs, used to size the GIF recording. */
export function estimateDuration(ctx: SimContext): number {
  let longest = 0;
  for (const path of Object.values(ctx.paths)) longest = Math.max(longest, path.length);
  const runTime = longest / 8 + 2.5;
  return Math.min(MAX_PLAY_TIME, Math.max(3.5, runTime));
}
