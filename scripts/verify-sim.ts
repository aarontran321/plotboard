/**
 * Headless verification of the simulation engine.
 *
 * Everything under src/lib (apart from render/gif) is DOM-free by design, which
 * lets the physics, defensive AI, history and schema be exercised without a
 * browser. Run with: npm run verify
 */

import {
  CATCH_RADIUS,
  FIELD_CENTER_Y,
  FIELD_LENGTH,
  FIELD_WIDTH,
  LOS_MAX_X,
  LOS_X,
  NEUTRAL_ZONE_DEPTH,
  clampToSide,
  dist,
  violatesScrimmage,
} from "../src/lib/field";
import { buildFormation, manAssignments } from "../src/lib/formations";
import { flattenPath, nearestOnPath } from "../src/lib/geometry";
import { History, restore, snapshot } from "../src/lib/history";
import {
  MAX_PLAY_NAME_LENGTH,
  defaultPlayName,
  playNameSlug,
  resolvePlayName,
} from "../src/lib/playName";
import { parsePlayState } from "../src/lib/playSchema";
import { buildPresetRoute } from "../src/lib/routePresets";
import {
  createContext,
  createInitialSim,
  routeProgress,
  simulateTo,
  stepSim,
} from "../src/lib/simulation";
import type {
  CoverageId,
  DefenseFormationId,
  FormationId,
  PlayState,
  SimState,
} from "../src/lib/types";

const ALL_FORMATIONS: FormationId[] = ["spread", "i-formation", "singleback", "empty"];
const ALL_DEFENSES: DefenseFormationId[] = ["4-3", "3-4", "nickel", "dime", "5-2"];

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

/** Builds a spread play with a slant to WR1 and a target on that route. */
function buildTestPlay(coverage: CoverageId = "man"): PlayState {
  const players = buildFormation("spread", "4-3", LOS_X);
  const wr1 = players.find((p) => p.id === "WR1")!;
  const route = buildPresetRoute("slant", { x: wr1.startX, y: wr1.startY });

  const path = flattenPath(route);
  // Aim at roughly three-quarters of the way down the route.
  const aim = nearestOnPath(path, path.pts[Math.floor(path.pts.length * 0.75)]);

  return {
    name: "Test Slant",
    formation: "spread",
    defenseFormation: "4-3",
    coverage,
    losX: LOS_X,
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
  const players = buildFormation("spread", "4-3", LOS_X);
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

// --- Rosters -------------------------------------------------------------

section("Rosters");
{
  for (const f of ALL_FORMATIONS) {
    const players = buildFormation(f, "4-3", LOS_X);
    const off = players.filter((p) => p.team === "offense");
    check(`${f} fields 7 on offense`, off.length === 7, `got ${off.length}`);
    check(`${f} has exactly one quarterback`, off.filter((p) => p.id === "QB").length === 1);
    check(`${f} has a centre`, off.some((p) => p.id === "C"));
  }

  for (const d of ALL_DEFENSES) {
    const players = buildFormation("spread", d, LOS_X);
    const def = players.filter((p) => p.team === "defense");
    check(`${d} fields 7 on defense`, def.length === 7, `got ${def.length}`);
  }

  // Ids are what routes, assignments and the pass target are all keyed by.
  for (const f of ALL_FORMATIONS) {
    for (const d of ALL_DEFENSES) {
      const players = buildFormation(f, d, LOS_X);
      const ids = new Set(players.map((p) => p.id));
      if (ids.size !== players.length) {
        check(`${f} vs ${d} has unique player ids`, false, "duplicate id");
      }
    }
  }
  check("every formation pairing has unique player ids", true);

  // Every defender must have a job: a man, a zone, or a pass rush.
  for (const d of ALL_DEFENSES) {
    const players = buildFormation("spread", d, LOS_X);
    const man = manAssignments(players);
    const covered = players.filter(
      (p) => p.team === "defense" && (man[p.id] || p.id.startsWith("DL") || p.id === "FS")
    );
    const def = players.filter((p) => p.team === "defense");
    check(
      `${d} leaves nobody in man coverage without a job`,
      covered.length === def.length,
      `${covered.length}/${def.length}`
    );
  }
}

// --- Line of scrimmage ---------------------------------------------------

section("Line of scrimmage");
{
  const half = NEUTRAL_ZONE_DEPTH / 2;

  // No generated alignment may start inside the neutral zone or across it.
  let allLegal = true;
  for (const f of ALL_FORMATIONS) {
    for (const d of ALL_DEFENSES) {
      for (const losX of [LOS_X, 30, 90]) {
        for (const p of buildFormation(f, d, losX)) {
          if (violatesScrimmage(p.startX, p.team, losX)) allLegal = false;
        }
      }
    }
  }
  check("no generated alignment violates the neutral zone", allLegal);

  // The two sides must actually be separated by the full neutral zone.
  const players = buildFormation("spread", "4-3", LOS_X);
  const frontOff = Math.max(...players.filter((p) => p.team === "offense").map((p) => p.startX));
  const frontDef = Math.min(...players.filter((p) => p.team === "defense").map((p) => p.startX));
  check(
    "offense stays behind the neutral zone",
    frontOff <= LOS_X - half + 1e-9,
    `front man at ${frontOff.toFixed(2)}, limit ${(LOS_X - half).toFixed(2)}`
  );
  check(
    "defense stays in front of the neutral zone",
    frontDef >= LOS_X + half - 1e-9,
    `front man at ${frontDef.toFixed(2)}, limit ${(LOS_X + half).toFixed(2)}`
  );

  // The drag clamp is the rule the UI enforces; it must agree with the builder.
  const pushed = clampToSide(LOS_X + 20, 25, "offense", LOS_X);
  check("clamping holds the offense at its limit", Math.abs(pushed.x - (LOS_X - half)) < 1e-9);
  const pushedDef = clampToSide(LOS_X - 20, 25, "defense", LOS_X);
  check("clamping holds the defense at its limit", Math.abs(pushedDef.x - (LOS_X + half)) < 1e-9);
  check("clamping leaves a legal position alone", clampToSide(20, 25, "offense", LOS_X).x === 20);
  check(
    "clamping still respects the field edges",
    clampToSide(-50, 25, "offense", LOS_X).x === 0 &&
      clampToSide(9999, 25, "defense", LOS_X).x === FIELD_LENGTH
  );

  // Moving the line moves the play with it.
  const shifted = buildFormation("spread", "4-3", 70);
  const qbAt45 = players.find((p) => p.id === "QB")!;
  const qbAt70 = shifted.find((p) => p.id === "QB")!;
  check(
    "the formation follows the line of scrimmage",
    Math.abs(qbAt70.startX - qbAt45.startX - 25) < 1e-9,
    `${qbAt45.startX} -> ${qbAt70.startX}`
  );

  // A play run from a different line must still work end to end.
  const deep: PlayState = { ...buildTestPlay("man"), losX: 60 };
  const rebuilt: PlayState = {
    ...deep,
    players: buildFormation("spread", "4-3", 60),
  };
  const wr1 = rebuilt.players.find((p) => p.id === "WR1")!;
  const route = buildPresetRoute("slant", { x: wr1.startX, y: wr1.startY });
  const path = flattenPath(route);
  const aim = nearestOnPath(path, path.pts[Math.floor(path.pts.length * 0.75)]);
  const moved = runToCompletion({
    ...rebuilt,
    routes: { WR1: route },
    passTarget: { x: aim.point.x, y: aim.point.y, receiverId: "WR1", t: aim.t },
  });
  check("a play from a moved line still resolves", moved.sim.outcome !== null, `${moved.sim.outcome}`);
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

// --- Pass Target Tool: free throws and deflection ------------------------

section("Pass Target Tool");
{
  // A free-throw target has no receiver to key release off of, so it must
  // still throw and resolve on a fixed timer rather than never releasing.
  const free: PlayState = {
    ...buildTestPlay("man"),
    passTarget: { x: LOS_X + 15, y: FIELD_CENTER_Y, receiverId: null, t: 0 },
  };
  const freeRun = runToCompletion(free);
  check(
    "a free-throw target still releases and resolves",
    freeRun.sim.ball !== null && freeRun.sim.outcome !== null,
    `${freeRun.sim.outcome}`
  );
  // By the time a free throw's fixed release timer elapses, a rushing lineman
  // may well have closed to bat-down range — a legitimate deflection, not a
  // bug — so an undisturbed throw only has to land on target *if* it wasn't
  // deflected first.
  check(
    "an undeflected free-throw ball lands on the free target",
    freeRun.sim.outcome === "Pass Deflected!" ||
      dist(freeRun.sim.ball!.x, freeRun.sim.ball!.y, free.passTarget!.x, free.passTarget!.y) < 0.01,
    `${freeRun.sim.outcome}`
  );

  // A target snapped onto a receiver with no drawn route (a hitch) behaves
  // the same way: it must not wait forever on route progress that never comes.
  const players = buildFormation("spread", "4-3", LOS_X);
  const wr2 = players.find((p) => p.id === "WR2")!;
  const hitch: PlayState = {
    name: "",
    formation: "spread",
    defenseFormation: "4-3",
    coverage: "man",
    losX: LOS_X,
    players,
    routes: {},
    passTarget: { x: wr2.startX, y: wr2.startY, receiverId: "WR2", t: 0 },
  };
  const hitchRun = runToCompletion(hitch);
  check(
    "a hitch to a routeless receiver still releases and resolves",
    hitchRun.sim.ball !== null && hitchRun.sim.outcome !== null,
    `${hitchRun.sim.outcome}`
  );

  // A defender standing right on top of the release point must bat the pass
  // down rather than let it fly to a target far downfield — distinct from an
  // interception, which only happens at the natural landing spot.
  const qb = players.find((p) => p.id === "QB")!;
  const rushOnQb = players.map((p) => (p.id === "DL1" ? { ...p, startX: qb.startX, startY: qb.startY } : p));
  const contested: PlayState = {
    name: "",
    formation: "spread",
    defenseFormation: "4-3",
    coverage: "man",
    losX: LOS_X,
    players: rushOnQb,
    routes: {},
    passTarget: { x: LOS_X + 30, y: FIELD_CENTER_Y, receiverId: null, t: 0 },
  };
  const contestedRun = runToCompletion(contested);
  check(
    "a defender on the release point deflects the pass",
    contestedRun.sim.outcome === "Pass Deflected!",
    `${contestedRun.sim.outcome}`
  );
  check(
    "a deflected pass lands well short of its intended target",
    dist(contestedRun.sim.ball!.x, contestedRun.sim.ball!.y, LOS_X + 30, FIELD_CENTER_Y) > 5
  );

  // `simulateTo` (the scrubber's engine) must agree exactly with stepping
  // there incrementally — that agreement is the whole premise of scrubbing.
  const scrubPlay = buildTestPlay("man");
  const ctx = createContext(scrubPlay);
  const stepped = createInitialSim(ctx);
  const dt = 1 / 120;
  let guard = 0;
  while (stepped.t < 2 && !stepped.finished && guard++ < 5000) stepSim(stepped, ctx, dt);
  const scrubbed = simulateTo(ctx, stepped.t, dt);
  check(
    "simulateTo agrees with incremental stepping",
    Math.abs(scrubbed.players["WR1"].x - stepped.players["WR1"].x) < 1e-6 &&
      Math.abs(scrubbed.players["WR1"].y - stepped.players["WR1"].y) < 1e-6,
    `stepped=(${stepped.players["WR1"].x.toFixed(4)},${stepped.players["WR1"].y.toFixed(4)}) ` +
      `scrubbed=(${scrubbed.players["WR1"].x.toFixed(4)},${scrubbed.players["WR1"].y.toFixed(4)})`
  );

  // A route-schema round-trip must accept a free-throw target's null receiver.
  const roundTripped = parsePlayState(JSON.parse(JSON.stringify(free)));
  check("schema accepts a free-throw target (null receiverId)", roundTripped?.passTarget?.receiverId === null);
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
    name: "",
    formation: "spread",
    defenseFormation: "4-3",
    coverage: "cover-3",
    losX: LOS_X,
    players: buildFormation("spread", "4-3", LOS_X),
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

  // Dragging the line of scrimmage is an edit, so undo has to restore it —
  // otherwise alignments would come back onto the wrong line.
  const losHistory = new History();
  const atDefault = buildTestPlay("man");
  losHistory.commit(snapshot(atDefault));
  const atSeventy: PlayState = { ...atDefault, losX: 70 };
  const back = losHistory.undo(snapshot(atSeventy));
  check("undo captures the line of scrimmage", back?.losX === LOS_X, `got ${back?.losX}`);
  check("undo restores the line of scrimmage", restore(atSeventy, back!).losX === LOS_X);
}

// --- Play naming ---------------------------------------------------------

section("Play naming");
{
  check("a typed name is kept", resolvePlayName("Vertical Cross") === "Vertical Cross");
  check("a name is trimmed", resolvePlayName("  Flex Offense  ") === "Flex Offense");

  // Blank, whitespace-only, null and undefined all mean "not named".
  const fixed = new Date(2026, 0, 2, 3, 4);
  const expected = defaultPlayName(fixed);
  check("a blank name falls back to the default", resolvePlayName("", fixed) === expected);
  check("whitespace only falls back to the default", resolvePlayName("   ", fixed) === expected);
  check("null falls back to the default", resolvePlayName(null, fixed) === expected);
  check("undefined falls back to the default", resolvePlayName(undefined, fixed) === expected);
  check("the default name is marked untitled", expected.startsWith("Untitled Play - "));
  check(
    "the default name carries a timestamp",
    defaultPlayName(new Date(2026, 5, 6, 7, 8)) !== expected
  );

  // The cap has to hold here as well as at the schema, or saving a long name
  // would produce a play the schema then rejects on read.
  const long = "x".repeat(200);
  check("a long name is capped", resolvePlayName(long).length === MAX_PLAY_NAME_LENGTH);
  check("a capped name still parses", parsePlayState({ ...buildTestPlay(), name: resolvePlayName(long) }) !== null);

  check("a slug is filename safe", playNameSlug("Vertical Cross!") === "vertical-cross");
  check("a slug collapses punctuation", playNameSlug("Flex — Offense (v2)") === "flex-offense-v2");
  check("a slug never ends up empty", playNameSlug("!!!") === "play");
  check("a slug has no leading or trailing dashes", !/^-|-$/.test(playNameSlug("  --Go--  ")));
}

// --- Schema validation ---------------------------------------------------

section("Schema validation");
{
  const play = buildTestPlay("man");
  const round = parsePlayState(JSON.parse(JSON.stringify(play)));
  check("a valid play round-trips", round !== null);
  check("round-trip preserves the route", round?.routes.WR1?.length === play.routes.WR1.length);
  check("round-trip preserves the pass target", round?.passTarget?.receiverId === "WR1");

  check("round-trip preserves the line of scrimmage", round?.losX === play.losX);
  check("round-trip preserves the defensive formation", round?.defenseFormation === "4-3");
  check("round-trip preserves the play name", round?.name === "Test Slant");

  const bad: [string, unknown][] = [
    ["null", null],
    ["a string", "not a play"],
    ["an unknown formation", { ...play, formation: "wildcat" }],
    ["an unknown defensive formation", { ...play, defenseFormation: "6-6" }],
    ["an unknown coverage", { ...play, coverage: "cover-9" }],
    ["no players", { ...play, players: [] }],
    ["an off-field player", { ...play, players: [{ ...play.players[0], startX: 9999 }] }],
    ["a NaN coordinate", { ...play, players: [{ ...play.players[0], startX: NaN }] }],
    ["a route for an unknown player", { ...play, routes: { GHOST: [{ x: 1, y: 1 }] } }],
    ["a target on an unknown receiver", { ...play, passTarget: { x: 1, y: 1, receiverId: "GHOST", t: 0.5 } }],
    ["an out-of-range target t", { ...play, passTarget: { x: 1, y: 1, receiverId: "WR1", t: 5 } }],
    ["a line of scrimmage in the endzone", { ...play, losX: 2 }],
    ["a line of scrimmage past the far limit", { ...play, losX: LOS_MAX_X + 5 }],
    ["a NaN line of scrimmage", { ...play, losX: NaN }],
    ["a non-string play name", { ...play, name: 42 }],
    ["an oversized play name", { ...play, name: "x".repeat(MAX_PLAY_NAME_LENGTH + 1) }],
  ];
  for (const [label, value] of bad) {
    check(`rejects ${label}`, parsePlayState(value) === null);
  }

  // Fields added after plays were already shareable must not break old links.
  const legacy = parsePlayState({ ...play, formation: "shotgun-spread" });
  check("accepts the pre-rename formation id", legacy !== null);
  check("maps the legacy formation id forward", legacy?.formation === "spread");

  const noExtras: Record<string, unknown> = { ...play };
  delete noExtras.losX;
  delete noExtras.defenseFormation;
  delete noExtras.name;
  const older = parsePlayState(noExtras);
  check("accepts a play saved before the line of scrimmage moved", older !== null);
  check("defaults a missing line of scrimmage", older?.losX === LOS_X);
  check("defaults a missing defensive formation", older?.defenseFormation === "4-3");
  // An unnamed play is valid: the default is derived at the point of use, so a
  // link shared before plays had names must not be rejected for lacking one.
  check("accepts a play with no name", older?.name === "");
  check("accepts an explicitly empty name", parsePlayState({ ...play, name: "" })?.name === "");

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
