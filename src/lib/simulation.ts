import { CATCH_RADIUS, clampToField, dist } from "./field";
import {
  isPassRusher,
  manAssignments,
  manSafetyHelp,
  rushTarget,
  zoneAssignments,
} from "./formations";
import { flattenPath, moveToward, pointAtDistance, type FlatPath } from "./geometry";
import type { Outcome, PlayEvent, PlayState, Point, SimState, ZoneAssignment } from "./types";

/** Gravity in yards/second^2 (32.174 ft/s^2 converted from feet). */
const GRAVITY = 32.174 / 3;

/** Horizontal ball velocity for a throw, in yards/second. */
const BALL_SPEED = 19;

/** The quarterback releases once the target receiver is this far into the route. */
const THROW_TRIGGER_T = 0.3;

/**
 * A free-throw target (open space, no receiver) has no route to trigger off
 * of, so the release is timed instead: long enough for the quarterback's drop
 * to settle, short enough to still read as anticipating a throw rather than
 * holding the ball.
 */
const FREE_THROW_RELEASE_T = 1.1;

/**
 * A pass can be batted down in the very first instant of its flight, while it
 * is still low and close to the rushers at the line of scrimmage — distinct
 * from an interception, which is resolved at the natural landing spot. Once
 * the ball has climbed past `BAT_MAX_Z` or flown longer than `BAT_WINDOW`,
 * only a catch at the landing spot can end the play.
 */
const BAT_RADIUS = 2.0;
const BAT_MAX_Z = 0.6;
const BAT_WINDOW = 0.15;

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
  /** Defender id -> assigned receiver id. Empty unless the call is man. */
  man: Record<string, string>;
  /** Deep-middle help landmark for an unassigned safety in man. */
  safetyHelp: Point;
  /** Where the pass rush attacks. */
  rush: Point;
}

export function createContext(play: PlayState): SimContext {
  const paths: Record<string, FlatPath> = {};
  for (const [id, pts] of Object.entries(play.routes)) {
    if (pts && pts.length >= 2) paths[id] = flattenPath(pts);
  }
  return {
    play,
    paths,
    // Assignments follow the personnel actually on the field, so both dropdowns
    // can change the roster without leaving anyone uncovered.
    zones: play.coverage === "man" ? {} : zoneAssignments(play.coverage, play.players, play.losX),
    man: play.coverage === "man" ? manAssignments(play.players) : {},
    safetyHelp: manSafetyHelp(play.losX),
    rush: rushTarget(play.players, play.losX),
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

/**
 * How deep the quarterback drops when no explicit route is drawn for him.
 * A shotgun/empty quarterback is already off the line, so he only settles.
 */
function dropDepth(ctx: SimContext) {
  return ctx.play.formation === "spread" || ctx.play.formation === "empty" ? 2 : 5;
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

    // Linemen rush the passer regardless of the coverage behind them.
    if (isPassRusher(p.id)) {
      const next = moveToward(ps, ctx.rush, p.speed * dt);
      ps.x = next.x;
      ps.y = next.y;
      continue;
    }

    if (ctx.play.coverage === "man") {
      const assignedId = ctx.man[p.id];
      if (assignedId && sim.players[assignedId]) {
        spot = sampleTrail(sim.players[assignedId].trail, lookback);
      } else {
        // A defender with no man (the single-high safety) works deep middle help.
        spot = ctx.safetyHelp;
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

/**
 * True once any defender has closed to bat-down range of the ball while it is
 * still low and freshly released. Checked every frame during the early flight
 * window rather than only at landing, since a batted pass never reaches its
 * intended target at all.
 */
function checkBatted(sim: SimState, ctx: SimContext): boolean {
  const ball = sim.ball!;
  if (ball.elapsed > BAT_WINDOW || ball.z > BAT_MAX_Z) return false;

  for (const p of ctx.play.players) {
    if (p.team !== "defense") continue;
    const ps = sim.players[p.id];
    if (dist(ps.x, ps.y, ball.x, ball.y) <= BAT_RADIUS) return true;
  }
  return false;
}

function stepBall(sim: SimState, ctx: SimContext, dt: number) {
  const target = ctx.play.passTarget;

  if (!sim.ball) {
    if (!target || !sim.players["QB"]) return;
    // Hold the ball until the intended receiver has run enough of the route —
    // or, for a free throw with no receiver to key off (or a target snapped
    // onto a receiver who was never given a route — a hitch, thrown right to
    // where they're standing), until the drop has had time to settle.
    const hasRoute = target.receiverId !== null && Boolean(ctx.paths[target.receiverId]);
    const ready = hasRoute
      ? routeProgress(sim, ctx, target.receiverId!) >= THROW_TRIGGER_T
      : sim.t >= FREE_THROW_RELEASE_T;
    if (ready) releaseBall(sim, ctx);
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

  if (checkBatted(sim, ctx)) {
    ball.phase = "landed";
    ball.z = 0;
    sim.outcome = "Pass Deflected!";
    sim.landedAt = sim.t;
    return;
  }

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

/**
 * The exact wall-clock duration a play takes, found by actually running it
 * once to completion rather than estimating from route length.
 *
 * This used to be a heuristic (`longest route length / 8 + 2.5`, clamped to
 * `[3.5, MAX_PLAY_TIME]`) used to size the GIF recording and the playback
 * deck's scrubber range. The heuristic and the real simulation are two
 * different computations of "how long is this play", and they can disagree —
 * which is exactly the bug this was rewritten to fix: the live playhead
 * correctly freezes at the play's real end (say, 6.0s), while the heuristic
 * "total duration" shown next to it could say something else entirely (say,
 * 11.56s) that the play was never actually going to reach. Running the real
 * sim once and using *that* number everywhere means the two can no longer
 * disagree, by construction, rather than by coincidence.
 */
export function computeExactDuration(ctx: SimContext, step = 1 / 120): number {
  const sim = createInitialSim(ctx);
  let guard = 0;
  while (!sim.finished && guard++ < 5000) {
    stepSim(sim, ctx, step);
  }
  return sim.t;
}

/**
 * Replays a play from scratch up to `targetT`, at a fixed timestep. This is
 * what makes the timeline scrubber possible without holding a second live
 * simulation: `stepSim` is a pure function of the previous state and `dt`, so
 * scrubbing to any point just means re-running from t=0 to there. Cheap in
 * practice — a play never runs longer than `MAX_PLAY_TIME` seconds.
 */
export function simulateTo(ctx: SimContext, targetT: number, step = 1 / 120): SimState {
  const sim = createInitialSim(ctx);
  const clamped = Math.max(0, targetT);
  while (sim.t < clamped && !sim.finished) {
    stepSim(sim, ctx, Math.min(step, clamped - sim.t));
  }
  return sim;
}

/**
 * Runs a play once, start to finish, recording the timestamp of each
 * milestone the play chat narrates: when the ball leaves the QB's hand, and
 * however the play ends (a clean whistle, a deflection, or an interception).
 * Computed once per play the same way `computeExactDuration` is — a full
 * deterministic replay — rather than threaded through the live sim, since
 * the chat needs every event up front to render its feed.
 *
 * There is no sack/tackle in this engine (pass rushers have no pocket to
 * collapse and no sack resolution — see `HANDOFF.md`), so a caller wanting a
 * fourth, more violent icon for that slot should use `"interception"`: it is
 * the one outcome here that is genuinely a defensive, play-ending stop.
 */
export function computePlayEvents(ctx: SimContext, step = 1 / 120): PlayEvent[] {
  const sim = createInitialSim(ctx);
  const events: PlayEvent[] = [];
  const targetId = ctx.play.passTarget?.receiverId ?? null;

  let sawRelease = false;
  let sawEnd = false;
  let guard = 0;

  while (!sim.finished && guard++ < 5000) {
    stepSim(sim, ctx, step);

    if (!sawRelease && sim.ball) {
      sawRelease = true;
      events.push({
        kind: "release",
        t: sim.t,
        label: "Ball Released",
        detail: targetId ? `QB releases, target ${targetId}` : "QB releases (free throw)",
      });
    }

    if (!sawEnd && sim.landedAt !== null) {
      sawEnd = true;
      if (sim.outcome === "Pass Deflected!") {
        events.push({
          kind: "deflected",
          t: sim.t,
          label: "Pass Deflected",
          detail: "Batted down near the release point",
        });
      } else if (sim.outcome === "Intercepted!") {
        events.push({
          kind: "interception",
          t: sim.t,
          label: "Intercepted",
          detail: "Defender makes the play",
        });
      } else {
        events.push({
          kind: "dead",
          t: sim.t,
          label: "Play Ends",
          detail: sim.outcome ?? "Whistle",
        });
      }
    }
  }

  return events;
}
