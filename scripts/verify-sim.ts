/**
 * Headless verification of the simulation engine.
 *
 * Everything under src/lib (apart from render/gif) is DOM-free by design, which
 * lets the physics, defensive AI, history and schema be exercised without a
 * browser. Run with: npm run verify
 */

import { CATCH_RADIUS, FIELD_LENGTH, FIELD_WIDTH, LOS_X, dist } from "../src/lib/field";
import { buildFormation } from "../src/lib/formations";
import { flattenPath, nearestOnPath } from "../src/lib/geometry";
import { History, restore, snapshot } from "../src/lib/history";
import { parsePlayState } from "../src/lib/playSchema";
import { buildPresetRoute } from "../src/lib/routePresets";
import { createContext, createInitialSim, routeProgress, stepSim } from "../src/lib/simulation";
import type { CoverageId, PlayState, SimState } from "../src/lib/types";

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = "") {
  checks++;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

/** Builds a shotgun play with a slant to WR1 and a target on that route. */
function buildTestPlay(coverage: CoverageId = "man"): PlayState {
  const players = buildFormation("shotgun-spread");
  const wr1 = players.find((p) => p.id === "WR1")!;
  const route = buildPresetRoute("slant", { x: wr1.startX, y: wr1.startY });

  const path = flattenPath(route);
  // Aim at roughly three-quarters of the way down the route.
  const aim = nearestOnPath(path, path.pts[Math.floor(path.pts.length * 0.75)]);

  return {
    formation: "shotgun-spread",
    coverage,
    players,
    routes: { WR1: route },
    passTarget: { x: aim.point.x, y: aim.point.y, receiverId: "WR1", t: aim.t },
  };
}

/** Runs a play to completion at a fixed timestep, collecting a trace. */
function runToCompletion(play: PlayState, dt = 1 / 60) {
  const ctx = createContext(play);
  const sim = createInitialSim(ctx);
  const trace: { t: number; z: number; phase: string; wr1Progress: number }[] = [];

  let guard = 0;
  while (!sim.finished && guard++ < 5000) {
    stepSim(sim, ctx, dt);
    trace.push({
      t: sim.t,
      z: sim.ball?.z ?? 0,
      phase: sim.ball?.phase ?? "none",
      wr1Progress: routeProgress(sim, ctx, "WR1"),
    });
  }
  return { sim, ctx, trace };
}

// --- Geometry ------------------------------------------------------------

section("Geometry");
{
  const straight = flattenPath([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ]);
  check("straight path length is exact", Math.abs(straight.length - 10) < 0.01, `got ${straight.length}`);

  const curve = flattenPath([
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 5 },
  ]);
  // A smoothed curve must be longer than the straight line between endpoints
  // but shorter than the full waypoint polyline.
  const chord = Math.hypot(10, 5);
  const polyline = 5 + Math.hypot(5, 5);
  check(
    "curve length falls between chord and polyline",
    curve.length > chord && curve.length < polyline,
    `chord=${chord.toFixed(2)} curve=${curve.length.toFixed(2)} poly=${polyline.toFixed(2)}`
  );

  const hit = nearestOnPath(straight, { x: 5, y: 3 });
  check("nearestOnPath finds perpendicular distance", Math.abs(hit.distance - 3) < 0.05, `got ${hit.distance}`);
  check("nearestOnPath reports midpoint progress", Math.abs(hit.t - 0.5) < 0.02, `got ${hit.t}`);
}

// --- Route presets -------------------------------------------------------

section("Route presets");
{
  const players = buildFormation("shotgun-spread");
  const wr1 = players.find((p) => p.id === "WR1")!; // above the midline
  const wr2 = players.find((p) => p.id === "WR2")!; // below the midline

  const slant1 = buildPresetRoute("slant", { x: wr1.startX, y: wr1.startY });
  const slant2 = buildPresetRoute("slant", { x: wr2.startX, y: wr2.startY });

  const end1 = slant1[slant1.length - 1];
  const end2 = slant2[slant2.length - 1];

  // Both slants must break toward the middle of the field, i.e. mirrored.
  check("slant from the top breaks inward (+y)", end1.y > wr1.startY, `${wr1.startY} -> ${end1.y}`);
  check("slant from the bottom breaks inward (-y)", end2.y < wr2.startY, `${wr2.startY} -> ${end2.y}`);
  check("slant gains ground upfield", end1.x > wr1.startX && end2.x > wr2.startX);

  const go = buildPresetRoute("go", { x: wr1.startX, y: wr1.startY });
  check("go route runs deep", go[go.length - 1].x - wr1.startX > 20);

  const curl = buildPresetRoute("curl", { x: wr1.startX, y: wr1.startY });
  const stem = curl[1];
  // A curl settles back toward the quarterback after the stem.
  check("curl comes back to the ball", curl[curl.length - 1].x < stem.x, `stem=${stem.x} end=${curl[2].x}`);

  const all = [...slant1, ...slant2, ...go, ...curl];
  check(
    "all preset points stay in bounds",
    all.every((p) => p.x >= 0 && p.x <= FIELD_LENGTH && p.y >= 0 && p.y <= FIELD_WIDTH)
  );
}

// --- Throw physics -------------------------------------------------------

section("Throw physics");
{
  const play = buildTestPlay("man");
  const { sim, trace } = runToCompletion(play);

  const flight = trace.filter((s) => s.phase === "flight");
  check("the quarterback throws", flight.length > 0);

  const releaseFrame = trace.find((s) => s.phase === "flight");
  check(
    "release happens near 30% route progress",
    releaseFrame !== undefined && releaseFrame.wr1Progress >= 0.29 && releaseFrame.wr1Progress < 0.4,
    `progress at release = ${releaseFrame?.wr1Progress.toFixed(3)}`
  );

  const peak = Math.max(...flight.map((s) => s.z));
  check("ball gains altitude", peak > 0.5, `peak z = ${peak.toFixed(2)} yd`);

  // The arc must be a parabola: rising then falling, ending at ground level.
  const peakIndex = flight.findIndex((s) => s.z === peak);
  const rising = flight.slice(0, peakIndex).every((s, i, a) => i === 0 || s.z >= a[i - 1].z - 1e-6);
  const falling = flight.slice(peakIndex).every((s, i, a) => i === 0 || s.z <= a[i - 1].z + 1e-6);
  check("arc rises monotonically to its peak", rising);
  check("arc falls monotonically after its peak", falling);

  check("ball lands at ground level", sim.ball !== null && Math.abs(sim.ball.z) < 1e-6, `z=${sim.ball?.z}`);
  check(
    "ball lands on the intended target",
    sim.ball !== null && dist(sim.ball.x, sim.ball.y, play.passTarget!.x, play.passTarget!.y) < 0.01
  );
}

// --- Outcomes ------------------------------------------------------------

section("Outcomes");
{
  const play = buildTestPlay("man");
  const { sim } = runToCompletion(play);
  const valid = ["Pass Completed!", "Intercepted!", "Incomplete Pass"];
  check("play resolves to an outcome", sim.outcome !== null && valid.includes(sim.outcome), `${sim.outcome}`);
  check("simulation terminates", sim.finished);

  // The outcome must agree with who was actually closest to the landing spot.
  const landing = sim.ball!.to;
  let nearest: { id: string; team: string; d: number } | null = null;
  for (const p of play.players) {
    const ps = sim.players[p.id];
    const d = dist(ps.x, ps.y, landing.x, landing.y);
    if (!nearest || d < nearest.d) nearest = { id: p.id, team: p.team, d };
  }
  const expected =
    nearest!.d > CATCH_RADIUS
      ? "Incomplete Pass"
      : nearest!.team === "defense"
        ? "Intercepted!"
        : "Pass Completed!";
  check(
    "outcome matches the nearest player to the ball",
    sim.outcome === expected,
    `nearest=${nearest!.id} (${nearest!.team}) at ${nearest!.d.toFixed(2)}yd -> expected ${expected}, got ${sim.outcome}`
  );
}

// --- Movement integrity --------------------------------------------------

section("Movement integrity");
{
  const play = buildTestPlay("man");
  const ctx = createContext(play);
  const sim = createInitialSim(ctx);
  const dt = 1 / 60;

  let maxStep = 0;
  let outOfBounds = false;
  const prev: Record<string, { x: number; y: number }> = {};
  for (const p of play.players) prev[p.id] = { ...sim.players[p.id] };

  for (let i = 0; i < 600 && !sim.finished; i++) {
    stepSim(sim, ctx, dt);
    for (const p of play.players) {
      const ps = sim.players[p.id];
      const step = dist(ps.x, ps.y, prev[p.id].x, prev[p.id].y);
      // Nobody may exceed their own top speed on any single frame.
      maxStep = Math.max(maxStep, step / (p.speed * dt));
      if (ps.x < 0 || ps.x > FIELD_LENGTH || ps.y < 0 || ps.y > FIELD_WIDTH) outOfBounds = true;
      prev[p.id] = { x: ps.x, y: ps.y };
    }
  }

  check("no player exceeds their top speed", maxStep <= 1.02, `worst frame = ${maxStep.toFixed(3)}x speed`);
  check("no player leaves the field", !outOfBounds);

  const wr1 = sim.players["WR1"];
  const wr1Start = play.players.find((p) => p.id === "WR1")!;
  check("the receiver actually runs the route", dist(wr1.x, wr1.y, wr1Start.startX, wr1Start.startY) > 5);
}

// --- Defensive AI --------------------------------------------------------

section("Defensive AI");
{
  // Man coverage: the corner assigned to WR1 should end up near WR1.
  const manPlay = buildTestPlay("man");
  const man = runToCompletion(manPlay);
  const manGap = dist(
    man.sim.players["CB1"].x,
    man.sim.players["CB1"].y,
    man.sim.players["WR1"].x,
    man.sim.players["WR1"].y
  );
  check("man coverage keeps CB1 tight to WR1", manGap < 6, `separation = ${manGap.toFixed(2)} yd`);

  // Zone: with no receiver threatening it, a defender sits on its landmark.
  const bare: PlayState = {
    formation: "shotgun-spread",
    coverage: "cover-3",
    players: buildFormation("shotgun-spread"),
    routes: {},
    passTarget: null,
  };
  const zone = runToCompletion(bare);
  const cb1 = zone.sim.players["CB1"];
  // Cover 3 corners bail to a deep third at LOS+17.
  check("cover 3 corner drops to its deep third", cb1.x > LOS_X + 12, `CB1 x = ${cb1.x.toFixed(1)} (LOS ${LOS_X})`);

  const cb1Start = bare.players.find((p) => p.id === "CB1")!;
  check("cover 3 corner actually bails from the line", cb1.x > cb1Start.startX + 5);

  // Cover 2 corners sit in the flat rather than bailing deep.
  const c2: PlayState = { ...bare, coverage: "cover-2" };
  const zone2 = runToCompletion(c2);
  check(
    "cover 2 corner stays shallower than cover 3",
    zone2.sim.players["CB1"].x < zone.sim.players["CB1"].x,
    `c2 x=${zone2.sim.players["CB1"].x.toFixed(1)} vs c3 x=${zone.sim.players["CB1"].x.toFixed(1)}`
  );
}

// --- Determinism ---------------------------------------------------------

section("Determinism");
{
  const play = buildTestPlay("man");
  const a = runToCompletion(play);
  const b = runToCompletion(play);
  const same = (x: SimState, y: SimState) =>
    x.outcome === y.outcome &&
    Object.keys(x.players).every(
      (id) =>
        Math.abs(x.players[id].x - y.players[id].x) < 1e-9 &&
        Math.abs(x.players[id].y - y.players[id].y) < 1e-9
    );
  check("identical inputs produce identical results", same(a.sim, b.sim));
}

// --- History -------------------------------------------------------------

section("Undo / redo");
{
  const history = new History();
  const play = buildTestPlay("man");

  check("nothing to undo initially", !history.canUndo && !history.canRedo);

  const s0 = snapshot(play);
  history.commit(s0);

  const moved: PlayState = {
    ...play,
    players: play.players.map((p) => (p.id === "WR1" ? { ...p, startX: p.startX + 5 } : p)),
  };
  check("undo becomes available after a commit", history.canUndo);

  const undone = history.undo(snapshot(moved));
  check("undo returns the prior state", undone !== null);
  const restored = restore(moved, undone!);
  const wr1 = restored.players.find((p) => p.id === "WR1")!;
  const origWr1 = play.players.find((p) => p.id === "WR1")!;
  check("undo restores the original position", Math.abs(wr1.startX - origWr1.startX) < 1e-9);
  check("redo becomes available after undo", history.canRedo);

  const redone = history.redo(snapshot(restored));
  check("redo returns the newer state", redone !== null);
  const reapplied = restore(restored, redone!);
  check(
    "redo re-applies the move",
    Math.abs(reapplied.players.find((p) => p.id === "WR1")!.startX - (origWr1.startX + 5)) < 1e-9
  );

  // A fresh edit after an undo must discard the redo branch.
  history.undo(snapshot(reapplied));
  history.commit(snapshot(reapplied));
  check("a new edit clears the redo branch", !history.canRedo);
}

// --- Schema validation ---------------------------------------------------

section("Schema validation");
{
  const play = buildTestPlay("man");
  const round = parsePlayState(JSON.parse(JSON.stringify(play)));
  check("a valid play round-trips", round !== null);
  check("round-trip preserves the route", round?.routes.WR1?.length === play.routes.WR1.length);
  check("round-trip preserves the pass target", round?.passTarget?.receiverId === "WR1");

  const bad: [string, unknown][] = [
    ["null", null],
    ["a string", "not a play"],
    ["an unknown formation", { ...play, formation: "wildcat" }],
    ["an unknown coverage", { ...play, coverage: "cover-9" }],
    ["no players", { ...play, players: [] }],
    ["an off-field player", { ...play, players: [{ ...play.players[0], startX: 9999 }] }],
    ["a NaN coordinate", { ...play, players: [{ ...play.players[0], startX: NaN }] }],
    ["a route for an unknown player", { ...play, routes: { GHOST: [{ x: 1, y: 1 }] } }],
    ["a target on an unknown receiver", { ...play, passTarget: { x: 1, y: 1, receiverId: "GHOST", t: 0.5 } }],
    ["an out-of-range target t", { ...play, passTarget: { x: 1, y: 1, receiverId: "WR1", t: 5 } }],
  ];
  for (const [label, value] of bad) {
    check(`rejects ${label}`, parsePlayState(value) === null);
  }

  // A payload built to be huge must not be accepted.
  const huge = { ...play, routes: { WR1: Array.from({ length: 5000 }, () => ({ x: 1, y: 1 })) } };
  check("rejects an oversized route", parsePlayState(huge) === null);
}

// --- Summary -------------------------------------------------------------

console.log(`\n${"=".repeat(50)}`);
console.log(`${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
console.log("All checks passed.");
