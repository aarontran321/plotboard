"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  LOS_HIT_RADIUS,
  LOS_MAX_X,
  LOS_MIN_X,
  PLAYER_HIT_RADIUS,
  ROUTE_HIT_RADIUS,
  clampToField,
  clampToSide,
  dist,
  makeView,
  toWorld,
  violatesScrimmage,
  type FieldTheme,
  type View,
} from "@/lib/field";
import { flattenPath, nearestOnPath, pointAtT } from "@/lib/geometry";
import { snapshot, type Snapshot } from "@/lib/history";
import { drawField, drawScene } from "@/lib/render";
import { buildPresetRoute } from "@/lib/routePresets";
import {
  computeDefenderPath,
  computeExactDuration,
  computePlayEvents,
  createContext,
  createInitialSim,
  forceThrow,
  pickTrailDefender,
  simulateTo,
  stepSim,
  type SimContext,
} from "@/lib/simulation";
import type { PassTarget, PlayerDef, PlayState, Point, RoutePresetId, SimState } from "@/lib/types";
import PlaybackDeck from "./PlaybackDeck";
import PlayerContextMenu from "./PlayerContextMenu";

interface Props {
  play: PlayState;
  selectedId: string | null;
  isPlaying: boolean;
  /** When true a drag from a player draws their route; otherwise it moves them. */
  drawMode: boolean;
  /** Playback rate multiplier. */
  speed: number;
  /** Sets the playback rate — the speed control lives in the deck below the field. */
  onSpeed: (s: number) => void;
  /** Increments to clear the simulation and return players to their alignment. */
  resetId: number;
  /**
   * Increments when the roster is rebuilt, to ease players from where they were
   * to their new alignment.
   */
  transitionId: number;
  /** True while the dedicated Pass Target Tool is armed. */
  isPlacingPassTarget: boolean;
  /** "turf" (default) or the coach's chalkboard look. */
  theme: FieldTheme;
  onSelect: (id: string | null) => void;
  onPlayChange: (next: PlayState) => void;
  /** Called once an interaction completes, with the state from before it began. */
  onCommit: (before: Snapshot) => void;
  onFinished: () => void;
  /** A target was placed (snapped to a receiver/route, or dropped free). */
  onPlaceTarget: (target: PassTarget) => void;
  onTogglePlay: () => void;
  /** Rewinds the loaded run to its first frame. */
  onRestart: () => void;
  /**
   * Fires whenever the playhead moves (live playback, a scrub, a step, or a
   * reset) and whenever the authored play changes its exact duration. This
   * is how the play dashboard below the field stays synchronized to the same
   * playhead the `PlaybackDeck` above it drives — both read from this one callback rather
   * than owning a second notion of "where we are in the play".
   */
  onPlaybackUpdate?: (update: { t: number; duration: number; sim: SimState | null }) => void;
}

/** Imperative controls exposed to a parent that wants to drive the same
 *  playhead the internal `PlaybackDeck` does — e.g. clicking an event marker
 *  on the keyframe timeline to seek straight to that frame. */
export interface FieldCanvasHandle {
  scrub: (t: number) => void;
  step: (deltaSeconds: number) => void;
  /**
   * The "Throw Now" control: forces the QB to release immediately, starting
   * playback first if the play hasn't been snapped yet. No-ops with no pass
   * target set, or once the ball has already left the QB's hand this run.
   */
  throwNow: () => void;
  /** The raw canvas element, so a caller (the onboarding tour) can measure
   *  and spotlight it without this component knowing that tour exists. */
  getCanvasEl: () => HTMLCanvasElement | null;
  /** The playback deck's wrapper element, same reasoning as `getCanvasEl`. */
  getDeckEl: () => HTMLDivElement | null;
}

/**
 * The gesture currently in progress on the canvas.
 *
 * `drag`, `group-drag` and `route` are mutually exclusive by construction:
 * which one a pointerdown produces is decided once, up front, from `drawMode`.
 * Nothing downstream re-decides, so a move can never turn into a draw
 * mid-gesture.
 */
type Interaction =
  | { kind: "none" }
  | { kind: "drag"; id: string; before: Snapshot }
  | {
      kind: "group-drag";
      ids: string[];
      /** Cursor world position at drag start, so every move computes a total
       *  offset from the same origin rather than compounding per-frame deltas. */
      anchor: Point;
      initialPlayers: Record<string, Point>;
      initialRoutes: Record<string, Point[]>;
      before: Snapshot;
    }
  | { kind: "route"; id: string; before: Snapshot }
  | { kind: "los"; before: Snapshot }
  | { kind: "marquee" };

/** Milliseconds a formation change takes to ease into place. */
const TRANSITION_MS = 340;

/** Seconds a boundary-violation warning ring stays visible. */
const WARN_MS = 450;

/** Milliseconds a context-menu "shimmer" highlight stays visible. */
const SHIMMER_MS = 1400;

/** Milliseconds the catch ripple ("drop ripple") animates for after a completion or interception. */
const RIPPLE_MS = 700;

/** Minimum spacing between sampled route points, in yards. */
const ROUTE_SAMPLE_SPACING = 0.7;

/** A drawn route shorter than this is treated as a stray click. */
const MIN_ROUTE_LENGTH = 1.5;

/** A marquee drag smaller than this in either axis (world yards) is treated
 *  as a plain click on open field rather than a selection box. */
const MARQUEE_MIN_DRAG = 1;

/** Largest frame step the sim will accept, so a stalled tab cannot teleport players. */
const MAX_FRAME_DT = 1 / 20;

/** How often the playback deck's time readout re-renders during a live run. */
const TIME_SYNC_MS = 80;

/** Cosmetic role labels a right-clicked token can be cycled through. Purely a
 *  display label — ids, speeds and man/zone coverage assignments are
 *  untouched. (Unrelated to `PlayState.assignments`, the coaching notes.) */
const ROLE_CYCLE: Record<PlayerDef["team"], string[]> = {
  offense: ["WR", "SLOT", "TE", "RB", "FB"],
  defense: ["CB", "S", "LB", "NB", "DL"],
};

function FieldCanvas(
  {
    play,
    selectedId,
    isPlaying,
    drawMode,
    speed,
    onSpeed,
    resetId,
    transitionId,
    isPlacingPassTarget,
    theme,
    onSelect,
    onPlayChange,
    onCommit,
    onFinished,
    onPlaceTarget,
    onTogglePlay,
    onRestart,
    onPlaybackUpdate,
  }: Props,
  ref: React.ForwardedRef<FieldCanvasHandle>
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deckWrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(() => makeView(960));

  // Key moments for the deck's timeline ticks — the same replay `PlayChat`
  // builds its feed from, so a moment lands on the same timestamp everywhere.
  const events = useMemo(() => computePlayEvents(createContext(play)), [play]);

  // The keyed defender's full travelled path, precomputed like `events`, so the
  // "yard trail" can be drawn up to any frame during playback or a scrub.
  const defenderPath = useMemo(() => {
    const id = pickTrailDefender(play);
    return id ? computeDefenderPath(createContext(play), id) : [];
  }, [play]);
  const defenderPathRef = useRef(defenderPath);
  useEffect(() => {
    defenderPathRef.current = defenderPath;
  });

  // Tokens dragged together as a group (shift-click to build one). Cleared
  // whenever the primary selection is cleared or draw mode is toggled on.
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  // `selectedId` and `drawMode` are owned by the parent and can change for
  // reasons outside this component's control (Esc, loading a play, changing
  // formation, pressing D) — clearing the local drag group in response is a
  // prop sync, not a derived value with an alternative render-time home.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
    if (selectedId === null) setGroupIds(new Set());
  }, [selectedId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
    if (drawMode) setGroupIds(new Set());
  }, [drawMode]);

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // Playback deck readout. `playbackDuration` tracks the *authored* play, so
  // the scrubber has a sensible range even before Play is first pressed;
  // `playbackT` tracks whatever simulation is actually loaded (live or seeked).
  const [playbackT, setPlaybackT] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  // Whether the ball has left the QB's hand in whatever sim is currently
  // loaded — the "Throw Now" button and shortcut are only meaningful before
  // that happens, so this is what disables them once it does.
  const [ballThrown, setBallThrown] = useState(false);
  const simRef = useRef<{ ctx: SimContext; sim: SimState } | null>(null);
  /** Mirrors `playbackDuration` for synchronous reads from callbacks. */
  const playbackDurationRef = useRef(0);
  const onPlaybackUpdateRef = useRef(onPlaybackUpdate);
  useEffect(() => {
    onPlaybackUpdateRef.current = onPlaybackUpdate;
  });

  /** Updates the local readout and notifies the parent dashboard, in one place. */
  const reportPlayback = useCallback((t: number, sim: SimState | null) => {
    setPlaybackT(t);
    setBallThrown(Boolean(sim?.ball));
    onPlaybackUpdateRef.current?.({ t, duration: playbackDurationRef.current, sim });
  }, []);

  useEffect(() => {
    // The deck's duration tracks the authored play (owned by the parent), not
    // an in-progress simulation, so it updates the moment a route changes —
    // before Play is ever pressed. Reported immediately (rather than waiting
    // for the next scrub/step) so the dashboard's timeline never shows a
    // stale duration for an edit that hasn't been played since.
    //
    // This is the *exact* duration (a full deterministic replay), not a
    // length-based estimate — using two different formulas for "how long is
    // this play" was exactly what let the live playhead correctly freeze at
    // the play's real end while the "total" shown next to it said something
    // else that was never going to be reached.
    const duration = computeExactDuration(createContext(play));
    playbackDurationRef.current = duration;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
    setPlaybackDuration(duration);
    onPlaybackUpdateRef.current?.({ t: simRef.current?.sim.t ?? 0, duration, sim: simRef.current?.sim ?? null });
  }, [play]);

  // The animation loop reads live values through refs so that re-renders never
  // tear down and restart it. Syncing happens in an effect rather than during
  // render, since a render may be discarded or replayed.
  const latest = useRef({
    play,
    selectedId,
    isPlaying,
    drawMode,
    speed,
    isPlacingPassTarget,
    theme,
    onFinished,
    onTogglePlay,
  });
  const viewRef = useRef(view);

  useEffect(() => {
    latest.current = {
      play,
      selectedId,
      isPlaying,
      drawMode,
      speed,
      isPlacingPassTarget,
      theme,
      onFinished,
      onTogglePlay,
    };
    viewRef.current = view;
  });

  /** Guards `onFinished` so a resolved play reports completion exactly once. */
  const notifiedRef = useRef(false);
  const interactionRef = useRef<Interaction>({ kind: "none" });
  const draftRef = useRef<Point[] | null>(null);
  /** In-progress marquee drag: world-space origin and current cursor point. */
  const marqueeRef = useRef<{ origin: Point; current: Point; additive: boolean } | null>(null);
  const fieldCacheRef = useRef<HTMLCanvasElement | null>(null);
  /** Ghost-target cursor position while the QB is selected and idle. */
  const hoverTargetRef = useRef<Point | null>(null);
  /** Receiver id within snapping range of the cursor, while the Pass Target Tool is armed. */
  const passSnapRef = useRef<string | null>(null);
  /** Marching-dash phase for the QB throw guides and the passing lane. */
  const qbDashRef = useRef(0);
  /** True while the pointer is over, or dragging, the line of scrimmage. */
  const losActiveRef = useRef(false);
  /** Player id -> timestamp of their last boundary violation. */
  const warnRef = useRef<Record<string, number>>({});
  /** Player currently under the cursor, drawn on top of any overlapping tokens. */
  const hoveredIdRef = useRef<string | null>(null);
  /** Player id -> timestamp a "shimmer" highlight was triggered from the context menu. */
  const shimmerRef = useRef<Record<string, number>>({});
  /** The catch ripple in progress, keyed by `sim.landedAt` so a landing that
   *  stays landed across frames triggers the animation exactly once. */
  const rippleRef = useRef<{ landedAt: number; x: number; y: number; startedAt: number } | null>(null);
  /** In-flight formation transition: where each player is easing from. */
  const transitionRef = useRef<{ from: Record<string, Point>; startedAt: number } | null>(null);
  const lastTimeSyncRef = useRef(0);

  // --- Sizing -------------------------------------------------------------

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setView(makeView(width));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Scale the backing store to the device pixel ratio so lines stay crisp on
  // high-DPI displays, then work in CSS pixels for all drawing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Rebuild the cached field at the new size (or when the theme changes —
    // turf and chalkboard are visually different enough that the cache must
    // not silently keep showing the old one).
    const cache = document.createElement("canvas");
    cache.width = Math.round(view.width * dpr);
    cache.height = Math.round(view.height * dpr);
    const cctx = cache.getContext("2d");
    if (cctx) {
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawField(cctx, view, { theme });
      fieldCacheRef.current = cache;
    }
  }, [view, theme]);

  // --- Simulation lifecycle ------------------------------------------------

  /** Tears down whatever simulation is loaded and resets the playback readout. */
  const invalidateSim = useCallback(() => {
    simRef.current = null;
    notifiedRef.current = false;
    reportPlayback(0, null);
  }, [reportPlayback]);

  /** Returns the loaded simulation, lazily creating one from the current play. */
  const ensureSim = useCallback(() => {
    if (simRef.current) return simRef.current;
    const ctx = createContext(latest.current.play);
    const entry = { ctx, sim: createInitialSim(ctx) };
    simRef.current = entry;
    return entry;
  }, []);

  // Declared *before* the play-start effect so that when a Restart-then-play
  // bumps `resetId` and `isPlaying` in the same commit, this tears the old sim
  // down first and the effect below then rebuilds a fresh one — otherwise the
  // stale finished sim would survive and playback would sit stuck at the end.
  useEffect(() => {
    if (resetId === 0) return;
    // `resetId` is a counter prop the parent bumps on Restart; tearing the sim
    // down (and zeroing the playback readout with it) is what "reset" means.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see note above
    invalidateSim();
  }, [resetId, invalidateSim]);

  // Pressing Play creates a fresh run only if none is loaded — a paused or
  // seeked simulation resumes exactly where it was, rather than restarting.
  // Depends on `resetId` too so a restart-then-play rebuilds after the teardown
  // above has run in the same commit.
  useEffect(() => {
    if (!isPlaying || simRef.current) return;
    const ctx = createContext(latest.current.play);
    simRef.current = { ctx, sim: createInitialSim(ctx) };
    notifiedRef.current = false;
  }, [isPlaying, resetId]);

  // --- Rendering ------------------------------------------------------------

  /** Ease-out, so a formation change decelerates into its alignment. */
  const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

  /** Paints the current state once. Reads refs, so it is safe to call anywhere. */
  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const {
      play: p,
      selectedId: sel,
      isPlaying: playing,
      drawMode: drawing,
      isPlacingPassTarget: placing,
      theme,
    } = latest.current;
    const now = performance.now();

    // Interpolate the visual-only formation transition.
    let transition: Record<string, Point> | null = null;
    const active = transitionRef.current;
    if (active) {
      const f = Math.min(1, (now - active.startedAt) / TRANSITION_MS);
      const e = easeOut(f);
      transition = {};
      for (const player of p.players) {
        const from = active.from[player.id];
        // A player who did not exist before the change simply appears in place.
        if (!from) continue;
        transition[player.id] = {
          x: from.x + (player.startX - from.x) * e,
          y: from.y + (player.startY - from.y) * e,
        };
      }
      if (f >= 1) transitionRef.current = null;
    }

    // Warnings fade out on a wall clock rather than a frame count.
    let warnings: Record<string, number> | undefined;
    for (const [id, at] of Object.entries(warnRef.current)) {
      const remaining = 1 - (now - at) / WARN_MS;
      if (remaining <= 0) {
        delete warnRef.current[id];
        continue;
      }
      warnings ??= {};
      warnings[id] = remaining;
    }

    // Shimmer highlights likewise expire on a wall clock, looping a sine phase.
    let shimmers: Record<string, number> | undefined;
    for (const [id, at] of Object.entries(shimmerRef.current)) {
      const elapsed = now - at;
      if (elapsed > SHIMMER_MS) {
        delete shimmerRef.current[id];
        continue;
      }
      shimmers ??= {};
      shimmers[id] = elapsed / SHIMMER_MS;
    }

    // Routes, the passing lane and the QB guides all march together whenever
    // the board is idle and not mid-draw — a broader idle animation than this
    // project used to allow, adopted deliberately for the "always alive"
    // aesthetic this pass asked for.
    const idleDash = !playing && !drawing ? qbDashRef.current : 0;

    // Fire the catch ripple exactly once per landing that was actually caught
    // (a completion or an interception) — a batted-down or incomplete pass
    // has nobody to ripple around.
    const activeSim = simRef.current?.sim ?? null;
    const caught =
      activeSim?.landedAt !== null &&
      activeSim?.ball &&
      (activeSim.outcome === "Pass Completed!" || activeSim.outcome === "Intercepted!");
    // Not routed through `pump()`: the idle marching-dash loop below already
    // holds an animation frame open whenever the board isn't playing or
    // drawing, and a catch can only happen mid-simulation, where the live
    // playback loop is already repainting every frame regardless.
    if (caught) {
      if (rippleRef.current?.landedAt !== activeSim.landedAt) {
        rippleRef.current = {
          landedAt: activeSim.landedAt!,
          x: activeSim.ball!.to.x,
          y: activeSim.ball!.to.y,
          startedAt: now,
        };
      }
    } else {
      rippleRef.current = null;
    }

    let ripple: { x: number; y: number; progress: number } | null = null;
    if (rippleRef.current) {
      const elapsed = now - rippleRef.current.startedAt;
      if (elapsed <= RIPPLE_MS) {
        ripple = { x: rippleRef.current.x, y: rippleRef.current.y, progress: elapsed / RIPPLE_MS };
      }
    }

    // The defensive yard trail only makes sense once a run is loaded; it grows
    // as the frozen/live playhead advances, so it is truncated to `sim.t`.
    let defenseTrail: Point[] | null = null;
    const simT = activeSim?.t;
    if (activeSim && simT !== undefined && defenderPathRef.current.length > 1) {
      defenseTrail = defenderPathRef.current.filter((pt) => pt.t <= simT).map((pt) => ({ x: pt.x, y: pt.y }));
    }

    const box = marqueeRef.current;
    const marquee = box
      ? {
          x0: Math.min(box.origin.x, box.current.x),
          y0: Math.min(box.origin.y, box.current.y),
          x1: Math.max(box.origin.x, box.current.x),
          y1: Math.max(box.origin.y, box.current.y),
        }
      : null;

    drawScene(ctx, viewRef.current, {
      play: p,
      sim: simRef.current?.sim ?? null,
      selectedId: sel,
      groupSelectedIds: groupIds.size > 0 ? [...groupIds] : undefined,
      draftRoute: draftRef.current,
      marquee,
      // Only meaningful while idle — hover tracking is suspended during
      // playback (see `onHover`), so a stale id from just before Play was
      // pressed must not keep pinning a token to the top layer.
      hoveredId: playing ? null : hoveredIdRef.current,
      qbGuide:
        sel === "QB" && !playing && !drawing
          ? { dashOffset: qbDashRef.current, hoverTarget: hoverTargetRef.current }
          : null,
      passPlacement: placing ? { snapReceiverId: passSnapRef.current } : null,
      dashOffset: idleDash,
      losActive: losActiveRef.current && !playing,
      drawMode: drawing,
      warnings,
      shimmers,
      transition,
      background: fieldCacheRef.current,
      theme,
      ripple,
      defenseTrail,
    });
  }, [groupIds]);

  // Repaint after any render that changed the board. The board is static while
  // idle, so there is no reason to hold an animation frame open.
  useEffect(() => {
    draw();
  });

  // The animation loop only exists while a play is running.
  useEffect(() => {
    if (!isPlaying) return;

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dtReal = Math.min(MAX_FRAME_DT, (now - last) / 1000);
      last = now;

      const active = simRef.current;
      if (active) {
        stepSim(active.sim, active.ctx, dtReal * latest.current.speed);

        if (now - lastTimeSyncRef.current > TIME_SYNC_MS) {
          lastTimeSyncRef.current = now;
          reportPlayback(active.sim.t, active.sim);
        }

        if (active.sim.finished && !notifiedRef.current) {
          notifiedRef.current = true;
          // Snap the reported time to the play's exact duration on finish. The
          // live loop steps by a variable, frame-timing-dependent dt, so the
          // moment `finished` flips its `sim.t` lands a hair short of (or past)
          // the fixed-step duration the deck shows as the total. Reporting the
          // canonical duration itself makes the readout settle to an exact
          // "X / X" instead of freezing a few hundredths early.
          reportPlayback(playbackDurationRef.current, active.sim);
          latest.current.onFinished();
        }
      }

      draw();
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, draw, reportPlayback]);

  // Routes, the passing lane and the QB guides all march continuously
  // whenever the board is idle and not mid-draw — a deliberately broader
  // "always alive" idle animation than this project used to allow, so the
  // whole board keeps a pulse rather than only three narrow exceptions.
  useEffect(() => {
    if (isPlaying || drawMode) return;

    let raf = 0;
    const tick = () => {
      qbDashRef.current = (qbDashRef.current + 0.35) % 1000;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, drawMode, draw]);

  /**
   * Drives frames for the transient idle animations (formation easing, the
   * boundary-warning flash, and context-menu shimmers) and stops the moment
   * all are done, so an idle board still holds no animation frame.
   */
  const pumpRef = useRef(0);
  const pump = useCallback(() => {
    if (pumpRef.current) return;
    const tick = () => {
      // `draw` retires finished transitions/warnings/shimmers as it renders,
      // so this reads their state afterwards to decide whether to keep going.
      draw();
      const busy =
        transitionRef.current !== null ||
        Object.keys(warnRef.current).length > 0 ||
        Object.keys(shimmerRef.current).length > 0;
      pumpRef.current = busy ? requestAnimationFrame(tick) : 0;
    };
    pumpRef.current = requestAnimationFrame(tick);
  }, [draw]);

  useEffect(() => () => cancelAnimationFrame(pumpRef.current), []);

  /*
   * Formation changes ease into place.
   *
   * This effect is declared *before* the one that records positions, so on the
   * render where `transitionId` changes it still sees the previous alignment —
   * which is exactly what the players need to animate from.
   */
  const posSnapshotRef = useRef<Record<string, Point>>({});

  useEffect(() => {
    if (transitionId === 0) return;
    const from = posSnapshotRef.current;
    if (Object.keys(from).length === 0) return;

    // A hidden tab never fires an animation frame, which would strand players
    // at their previous alignment. There is nothing to watch there anyway, so
    // the change simply applies.
    if (typeof document !== "undefined" && document.hidden) return;

    transitionRef.current = { from, startedAt: performance.now() };
    pump();
  }, [transitionId, pump]);

  useEffect(() => {
    const snap: Record<string, Point> = {};
    for (const p of play.players) snap[p.id] = { x: p.startX, y: p.startY };
    posSnapshotRef.current = snap;
  });

  // --- Playback deck --------------------------------------------------------

  const onScrub = useCallback(
    (t: number) => {
      const entry = ensureSim();
      // Reuses the same exact duration the deck displays (kept current by the
      // `[play]` effect above), rather than a second computation that could
      // let the scrub range disagree with what the deck says the total is.
      const duration = playbackDurationRef.current;
      const sim = simulateTo(entry.ctx, Math.min(Math.max(0, t), duration));
      simRef.current = { ctx: entry.ctx, sim };
      notifiedRef.current = sim.finished;
      reportPlayback(sim.t, sim);
      draw();
    },
    [ensureSim, draw, reportPlayback]
  );

  const onStep = useCallback(
    (deltaSeconds: number) => {
      const current = simRef.current?.sim.t ?? 0;
      onScrub(current + deltaSeconds);
    },
    [onScrub]
  );

  /**
   * The "Throw Now" control (a key press or the playback deck button): forces
   * an immediate release regardless of the automatic route-progress/timer
   * heuristic. A finished run is torn down and restarted first, so the throw
   * always lands on a live play rather than replaying a dead one; an idle,
   * never-started board is kicked into playback the same way pressing
   * Simulate Play would, so "any time" really does include before the snap.
   */
  const throwNow = useCallback(() => {
    if (latest.current.isPlacingPassTarget || latest.current.drawMode) return;
    if (!latest.current.play.passTarget) return;

    let entry = ensureSim();
    if (entry.sim.finished) {
      invalidateSim();
      entry = ensureSim();
    }

    if (forceThrow(entry.ctx, entry.sim)) reportPlayback(entry.sim.t, entry.sim);
    if (!latest.current.isPlaying) latest.current.onTogglePlay();
    draw();
  }, [ensureSim, invalidateSim, reportPlayback, draw]);

  // The play dashboard below the field drives this same playhead (e.g.
  // clicking a timeline event marker), so it gets the same scrub/step
  // functions the internal PlaybackDeck uses — not a second implementation.
  useImperativeHandle(
    ref,
    () => ({
      scrub: onScrub,
      step: onStep,
      throwNow,
      getCanvasEl: () => canvasRef.current,
      getDeckEl: () => deckWrapRef.current,
    }),
    [onScrub, onStep, throwNow]
  );

  // --- Interaction --------------------------------------------------------

  const pointerToWorld = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return toWorld(viewRef.current, e.clientX - rect.left, e.clientY - rect.top);
  }, []);

  const playerAt = useCallback(
    (p: Point) => {
      let best: { id: string; d: number } | null = null;
      for (const player of play.players) {
        const d = dist(p.x, p.y, player.startX, player.startY);
        if (d <= PLAYER_HIT_RADIUS && (!best || d < best.d)) best = { id: player.id, d };
      }
      return best?.id ?? null;
    },
    [play.players]
  );

  /** Finds the closest point on any receiver's route to a click. */
  const routePointAt = useCallback(
    (p: Point) => {
      let best: { receiverId: string; t: number; point: Point; d: number } | null = null;
      for (const [id, pts] of Object.entries(play.routes)) {
        if (id === "QB" || !pts || pts.length < 2) continue;
        const hit = nearestOnPath(flattenPath(pts), p);
        if (hit.distance <= ROUTE_HIT_RADIUS && (!best || hit.distance < best.d)) {
          best = { receiverId: id, t: hit.t, point: hit.point, d: hit.distance };
        }
      }
      return best;
    },
    [play.routes]
  );

  /** Nearest eligible offensive receiver token (not the QB or centre) to a point. */
  const eligibleReceiverAt = useCallback(
    (p: Point): PlayerDef | null => {
      let best: { player: PlayerDef; d: number } | null = null;
      for (const player of play.players) {
        if (player.team !== "offense" || player.id === "QB" || player.id === "C") continue;
        const d = dist(p.x, p.y, player.startX, player.startY);
        if (d <= PLAYER_HIT_RADIUS && (!best || d < best.d)) best = { player, d };
      }
      return best?.player ?? null;
    },
    [play.players]
  );

  /**
   * With the quarterback selected, a click on a receiver's route sets the pass
   * target rather than starting a route for the quarterback himself. Returns
   * whether the click was consumed as a target placement.
   */
  const tryPlaceQBTarget = useCallback(
    (world: Point, before: Snapshot) => {
      const hit = routePointAt(world);
      if (!hit) return false;
      onCommit(before);
      onPlayChange({
        ...play,
        passTarget: { x: hit.point.x, y: hit.point.y, receiverId: hit.receiverId, t: hit.t },
      });
      return true;
    },
    [play, routePointAt, onCommit, onPlayChange]
  );

  /**
   * Resolves a click made while the Pass Target Tool is armed: snap to the
   * nearest route within range, else snap to a bare receiver token (a hitch,
   * thrown right to where they're standing), else drop a free target in open
   * space — the tool always consumes the click.
   */
  const resolvePlacement = useCallback(
    (world: Point): PassTarget => {
      const routeHit = routePointAt(world);
      if (routeHit) {
        return { x: routeHit.point.x, y: routeHit.point.y, receiverId: routeHit.receiverId, t: routeHit.t };
      }
      const receiver = eligibleReceiverAt(world);
      if (receiver) {
        return { x: receiver.startX, y: receiver.startY, receiverId: receiver.id, t: 0 };
      }
      const free = clampToField(world.x, world.y);
      return { x: free.x, y: free.y, receiverId: null, t: 0 };
    },
    [routePointAt, eligibleReceiverAt]
  );

  const startRoute = (
    player: { id: string; startX: number; startY: number },
    world: Point,
    before: Snapshot
  ) => {
    draftRef.current = [{ x: player.startX, y: player.startY }, world];
    interactionRef.current = { kind: "route", id: player.id, before };
  };

  /** Flags a player as having been held back at their boundary. */
  const warn = (id: string) => {
    warnRef.current[id] = performance.now();
    pump();
  };

  const nearLos = (world: Point) => Math.abs(world.x - play.losX) <= LOS_HIT_RADIUS;

  /*
   * The single decision point for move-vs-draw.
   *
   * Which gesture a pointerdown becomes is settled here and recorded on
   * `interactionRef`; pointermove only ever services the gesture already
   * chosen. That is what keeps a drag on a player from being reinterpreted as
   * a route: in move mode there is no code path from `drag` to `route`.
   */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    setMenu(null);

    const world = pointerToWorld(e);
    const capture = () => e.currentTarget.setPointerCapture(e.pointerId);

    // The Pass Target Tool intercepts every click while armed, regardless of
    // what is underneath the cursor — it always consumes the click and hands
    // the result straight to the caller, which also turns the tool back off.
    if (isPlacingPassTarget) {
      onPlaceTarget(resolvePlacement(world));
      return;
    }

    // Any edit invalidates a paused or completed run.
    invalidateSim();

    const before = snapshot(play);

    // 1. A player under the cursor always wins the gesture.
    const hitId = playerAt(world);
    if (hitId) {
      const player = play.players.find((p) => p.id === hitId)!;
      onSelect(hitId);

      // Shift-click builds a drag group instead of starting a gesture.
      if (e.shiftKey && !drawMode) {
        setGroupIds((prev) => {
          const next = new Set(prev);
          if (next.size === 0 && selectedId && selectedId !== hitId) next.add(selectedId);
          if (next.has(hitId)) next.delete(hitId);
          else next.add(hitId);
          return next;
        });
        return;
      }

      if (drawMode && player.team === "offense") {
        startRoute(player, world, before);
      } else if (!drawMode && groupIds.size > 1 && groupIds.has(hitId)) {
        const initialPlayers: Record<string, Point> = {};
        const initialRoutes: Record<string, Point[]> = {};
        for (const id of groupIds) {
          const gp = play.players.find((pp) => pp.id === id);
          if (gp) initialPlayers[id] = { x: gp.startX, y: gp.startY };
          if (play.routes[id]) initialRoutes[id] = play.routes[id];
        }
        interactionRef.current = {
          kind: "group-drag",
          ids: [...groupIds],
          anchor: world,
          initialPlayers,
          initialRoutes,
          before,
        };
      } else {
        setGroupIds(new Set());
        interactionRef.current = { kind: "drag", id: hitId, before };
      }
      capture();
      return;
    }

    const selected = play.players.find((p) => p.id === selectedId);

    // 2. With the quarterback selected, a click on a receiver's route places
    //    the pass target. Only in move mode; in draw mode the quarterback is
    //    drawing a route like anyone else.
    if (!drawMode && selected?.id === "QB" && tryPlaceQBTarget(world, before)) return;

    // 3. The line of scrimmage, which sets where the play starts.
    if (nearLos(world)) {
      interactionRef.current = { kind: "los", before };
      losActiveRef.current = true;
      capture();
      draw();
      return;
    }

    // 4. In draw mode, open field extends the selected player's route.
    if (drawMode && selected && selected.team === "offense") {
      startRoute(selected, world, before);
      capture();
      return;
    }

    // 5. In move mode, open field starts a marquee drag rather than clearing
    //    the selection immediately — `endInteraction` decides, from how far
    //    the drag actually travelled, whether this was a click or a box.
    if (!drawMode) {
      marqueeRef.current = { origin: world, current: world, additive: e.shiftKey };
      interactionRef.current = { kind: "marquee" };
      capture();
      draw();
      return;
    }

    setGroupIds(new Set());
    onSelect(null);
  };

  /** Hover feedback only — runs when no gesture is in progress. */
  const onHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    const world = pointerToWorld(e);
    let repaint = false;

    // Whichever token the cursor sits over is drawn last (on top of any
    // overlapping tokens) and gets a highlight ring, so a dense cluster (e.g.
    // around an interception) can still be picked apart by hovering.
    const hoverHit = playerAt(world);
    if (hoverHit !== hoveredIdRef.current) {
      hoveredIdRef.current = hoverHit;
      repaint = true;
    }

    if (isPlacingPassTarget) {
      const hit = routePointAt(world);
      const receiver = hit ? null : eligibleReceiverAt(world);
      const snapId = hit?.receiverId ?? receiver?.id ?? null;
      if (snapId !== passSnapRef.current) {
        passSnapRef.current = snapId;
        repaint = true;
      }
      if (repaint) draw();
      return;
    }

    const overLos = nearLos(world) && !hoverHit;
    if (overLos !== losActiveRef.current) {
      losActiveRef.current = overLos;
      repaint = true;
    }

    const hit = !drawMode && selectedId === "QB" ? routePointAt(world) : null;
    const nextGhost = hit ? hit.point : null;
    if (Boolean(nextGhost) !== Boolean(hoverTargetRef.current) || nextGhost) {
      hoverTargetRef.current = nextGhost;
      repaint = true;
    }

    if (repaint) draw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction.kind === "none") {
      onHover(e);
      return;
    }

    const raw = pointerToWorld(e);

    if (interaction.kind === "marquee") {
      const box = marqueeRef.current;
      if (!box) return;
      marqueeRef.current = { ...box, current: raw };
      draw();
      return;
    }

    // Dragging the line of scrimmage carries both alignments with it, so the
    // formation keeps its shape relative to the new start point.
    if (interaction.kind === "los") {
      const nextLos = Math.max(LOS_MIN_X, Math.min(LOS_MAX_X, raw.x));
      const shift = nextLos - play.losX;
      if (shift === 0) return;

      onPlayChange({
        ...play,
        losX: nextLos,
        players: play.players.map((p) => {
          const moved = clampToSide(p.startX + shift, p.startY, p.team, nextLos);
          return { ...p, startX: moved.x, startY: moved.y };
        }),
        routes: Object.fromEntries(
          Object.entries(play.routes).map(([id, pts]) => [
            id,
            pts.map((pt) => ({ x: pt.x + shift, y: pt.y })),
          ])
        ),
        passTarget: play.passTarget
          ? { ...play.passTarget, x: play.passTarget.x + shift }
          : null,
      });
      return;
    }

    if (interaction.kind === "group-drag") {
      const dx = raw.x - interaction.anchor.x;
      const dy = raw.y - interaction.anchor.y;
      if (dx === 0 && dy === 0) return;

      // Every move recomputes from the snapshot taken at drag start, using the
      // total offset from the anchor — not an incremental per-frame delta —
      // so repeated moves never compound.
      const players = play.players.map((p) => {
        const orig = interaction.initialPlayers[p.id];
        if (!orig) return p;
        const spot = clampToSide(orig.x + dx, orig.y + dy, p.team, play.losX);
        return { ...p, startX: spot.x, startY: spot.y };
      });

      for (const [id, orig] of Object.entries(interaction.initialPlayers)) {
        const team = play.players.find((p) => p.id === id)!.team;
        if (violatesScrimmage(orig.x + dx, team, play.losX)) warn(id);
      }

      const routes = { ...play.routes };
      for (const [id, pts] of Object.entries(interaction.initialRoutes)) {
        const orig = interaction.initialPlayers[id];
        const moved = players.find((p) => p.id === id);
        if (!orig || !moved) continue;
        const rdx = moved.startX - orig.x;
        const rdy = moved.startY - orig.y;
        routes[id] = pts.map((pt) => ({ x: pt.x + rdx, y: pt.y + rdy }));
      }

      onPlayChange({
        ...play,
        players,
        routes,
        passTarget:
          play.passTarget?.receiverId && interaction.ids.includes(play.passTarget.receiverId)
            ? null
            : play.passTarget,
      });
      return;
    }

    if (interaction.kind === "drag") {
      const player = play.players.find((p) => p.id === interaction.id);
      if (!player) return;

      // Players are held on their own side of the neutral zone. The clamp is
      // the same one the formation builder uses, so a dragged player can never
      // reach a spot a generated alignment would not.
      const spot = clampToSide(raw.x, raw.y, player.team, play.losX);
      if (violatesScrimmage(raw.x, player.team, play.losX)) warn(player.id);

      const dx = spot.x - player.startX;
      const dy = spot.y - player.startY;

      // Drag the player's route along with them, so the shape is preserved.
      const routes = { ...play.routes };
      const own = routes[interaction.id];
      if (own) routes[interaction.id] = own.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));

      onPlayChange({
        ...play,
        players: play.players.map((p) =>
          p.id === interaction.id ? { ...p, startX: spot.x, startY: spot.y } : p
        ),
        routes,
        // The target rides the receiver's route, so moving that receiver drops it.
        passTarget: play.passTarget?.receiverId === interaction.id ? null : play.passTarget,
      });
      return;
    }

    // Routes may cross the line of scrimmage freely — the restriction is on
    // pre-snap alignment, not on where a player goes once the ball is snapped.
    const world = clampToField(raw.x, raw.y);
    const draft = draftRef.current;
    if (!draft) return;
    const last = draft[draft.length - 1];
    if (dist(last.x, last.y, world.x, world.y) < ROUTE_SAMPLE_SPACING) return;

    // The draft lives in a ref to keep per-move React updates out of the hot
    // path, so the repaint has to be requested explicitly.
    draft.push(world);
    draw();
  };

  const endInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    interactionRef.current = { kind: "none" };
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (interaction.kind === "los") {
      losActiveRef.current = false;
      // As with a player drag, a grab that moved nothing is not an edit.
      if (interaction.before.losX !== play.losX) onCommit(interaction.before);
      draw();
      return;
    }

    if (interaction.kind === "group-drag") {
      const movedAny = interaction.ids.some((id) => {
        const was = interaction.before.players.find((p) => p.id === id);
        const now = play.players.find((p) => p.id === id);
        return was && now && (was.startX !== now.startX || was.startY !== now.startY);
      });
      if (movedAny) onCommit(interaction.before);
      return;
    }

    if (interaction.kind === "drag") {
      // A click that selects without moving is not an edit, so it must not
      // leave a no-op entry on the undo stack.
      const was = interaction.before.players.find((p) => p.id === interaction.id);
      const now = play.players.find((p) => p.id === interaction.id);
      const moved =
        was && now && (was.startX !== now.startX || was.startY !== now.startY);
      if (moved) onCommit(interaction.before);
      return;
    }

    if (interaction.kind === "marquee") {
      const box = marqueeRef.current;
      marqueeRef.current = null;
      draw();
      if (!box) return;

      const x0 = Math.min(box.origin.x, box.current.x);
      const x1 = Math.max(box.origin.x, box.current.x);
      const y0 = Math.min(box.origin.y, box.current.y);
      const y1 = Math.max(box.origin.y, box.current.y);

      // A drag too small to have been deliberate is a plain click on open
      // field: clear the selection (unless shift was held, in which case a
      // stray shift-click shouldn't wipe out what's already selected).
      if (x1 - x0 < MARQUEE_MIN_DRAG && y1 - y0 < MARQUEE_MIN_DRAG) {
        if (!box.additive) {
          setGroupIds(new Set());
          onSelect(null);
        }
        return;
      }

      const hits = play.players
        .filter((p) => p.startX >= x0 && p.startX <= x1 && p.startY >= y0 && p.startY <= y1)
        .map((p) => p.id);

      if (hits.length === 0) {
        if (!box.additive) {
          setGroupIds(new Set());
          onSelect(null);
        }
        return;
      }

      if (hits.length === 1) {
        setGroupIds(box.additive ? (prev) => new Set(prev).add(hits[0]) : new Set());
        onSelect(hits[0]);
        return;
      }

      setGroupIds((prev) => {
        const next = box.additive ? new Set(prev) : new Set<string>();
        for (const id of hits) next.add(id);
        return next;
      });
      onSelect(hits[0]);
      return;
    }

    if (interaction.kind === "route") {
      const draft = draftRef.current;
      draftRef.current = null;
      if (!draft || draft.length < 2) return;

      const length = draft.reduce(
        (sum, p, i) => (i === 0 ? 0 : sum + dist(p.x, p.y, draft[i - 1].x, draft[i - 1].y)),
        0
      );
      if (length < MIN_ROUTE_LENGTH) return;

      onCommit(interaction.before);
      onPlayChange({
        ...play,
        routes: { ...play.routes, [interaction.id]: draft },
        // A rewritten route invalidates a target that sat on the old one.
        passTarget: play.passTarget?.receiverId === interaction.id ? null : play.passTarget,
      });
    }
  };

  // --- Context menu --------------------------------------------------------

  const onCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isPlaying || isPlacingPassTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const world = toWorld(viewRef.current, e.clientX - rect.left, e.clientY - rect.top);
    const hitId = playerAt(world);
    if (!hitId) return;
    onSelect(hitId);
    setMenu({ id: hitId, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  /**
   * Instant throw: double-click any eligible receiver (or a point on their
   * route) to make the quarterback throw there — no need to select the QB, arm
   * the Pass Target Tool, or be in a particular mode. This is the quickest way
   * to say "throw to this guy". Double-clicking open field or a non-receiver
   * does nothing, so a stray double-click never drops a target in space.
   */
  const onCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPlaying || isPlacingPassTarget || drawMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const world = toWorld(viewRef.current, e.clientX - rect.left, e.clientY - rect.top);

    const routeHit = routePointAt(world);
    const receiver = routeHit ? null : eligibleReceiverAt(world);
    if (!routeHit && !receiver) return;

    const target: PassTarget = routeHit
      ? { x: routeHit.point.x, y: routeHit.point.y, receiverId: routeHit.receiverId, t: routeHit.t }
      : { x: receiver!.startX, y: receiver!.startY, receiverId: receiver!.id, t: 0 };

    const before = snapshot(play);
    onCommit(before);
    onPlayChange({ ...play, passTarget: target });
  };

  const menuPlayer = menu ? (play.players.find((p) => p.id === menu.id) ?? null) : null;
  const menuHasRoute = menu ? Boolean(play.routes[menu.id]?.length) : false;
  const menuCanSetPrimary = Boolean(
    menuPlayer && menuPlayer.team === "offense" && menuPlayer.id !== "QB" && menuPlayer.id !== "C"
  );
  const menuCanRoute = Boolean(menuPlayer && menuPlayer.team === "offense" && menuPlayer.id !== "QB");

  const menuPreset = (preset: RoutePresetId) => {
    if (!menu || !menuPlayer) return;
    const before = snapshot(play);
    const route = buildPresetRoute(preset, { x: menuPlayer.startX, y: menuPlayer.startY });
    onCommit(before);
    onPlayChange({
      ...play,
      routes: { ...play.routes, [menu.id]: route },
      passTarget: play.passTarget?.receiverId === menu.id ? null : play.passTarget,
    });
  };

  const menuDeleteRoute = () => {
    if (!menu) return;
    const before = snapshot(play);
    const routes = { ...play.routes };
    delete routes[menu.id];
    onCommit(before);
    onPlayChange({
      ...play,
      routes,
      passTarget: play.passTarget?.receiverId === menu.id ? null : play.passTarget,
    });
  };

  const menuChangeRole = () => {
    if (!menu || !menuPlayer) return;
    const before = snapshot(play);
    const pool = ROLE_CYCLE[menuPlayer.team];
    const suffix = menuPlayer.label.match(/\d+$/)?.[0] ?? "";
    const stem = menuPlayer.label.replace(/\d+$/, "");
    const idx = pool.indexOf(stem);
    const nextStem = pool[(idx + 1) % pool.length];
    onCommit(before);
    onPlayChange({
      ...play,
      players: play.players.map((p) =>
        p.id === menu.id ? { ...p, label: `${nextStem}${suffix}` } : p
      ),
    });
  };

  const menuSetPrimary = () => {
    if (!menu || !menuCanSetPrimary) return;
    const before = snapshot(play);
    const route = play.routes[menu.id];
    let target: PassTarget;
    if (route && route.length >= 2) {
      const pt = pointAtT(flattenPath(route), 0.3);
      target = { x: pt.x, y: pt.y, receiverId: menu.id, t: 0.3 };
    } else {
      const p = play.players.find((pp) => pp.id === menu.id)!;
      target = { x: p.startX, y: p.startY, receiverId: menu.id, t: 0 };
    }
    onCommit(before);
    onPlayChange({ ...play, passTarget: target });
  };

  const menuShimmer = () => {
    if (!menu) return;
    shimmerRef.current[menu.id] = performance.now();
    pump();
  };

  // The cursor is the cheapest signal for which gesture a drag will produce.
  const canvasCursor = isPlaying
    ? "default"
    : isPlacingPassTarget
      ? "crosshair"
      : drawMode
        ? "crosshair"
        : "grab";

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onContextMenu={onCanvasContextMenu}
        onDoubleClick={onCanvasDoubleClick}
        onPointerLeave={() => {
          if (interactionRef.current.kind !== "none") return;
          if (
            !hoverTargetRef.current &&
            !losActiveRef.current &&
            !passSnapRef.current &&
            !hoveredIdRef.current
          ) {
            return;
          }
          hoverTargetRef.current = null;
          losActiveRef.current = false;
          passSnapRef.current = null;
          hoveredIdRef.current = null;
          draw();
        }}
        className={
          "block w-full touch-none rounded-2xl border border-white/10 " +
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_24px_rgba(0,0,0,0.45)]"
        }
        style={{ cursor: canvasCursor }}
      />

      {menu && menuPlayer && (
        <PlayerContextMenu
          x={menu.x}
          y={menu.y}
          playerLabel={`${menuPlayer.team === "offense" ? "Offense" : "Defense"} — ${menuPlayer.label}`}
          hasRoute={menuHasRoute}
          canSetPrimary={menuCanSetPrimary}
          canRoute={menuCanRoute}
          onPreset={menuPreset}
          onDeleteRoute={menuDeleteRoute}
          onChangeRole={menuChangeRole}
          onSetPrimary={menuSetPrimary}
          onShimmer={menuShimmer}
          onClose={() => setMenu(null)}
        />
      )}

      <div ref={deckWrapRef} className="mt-2">
        <PlaybackDeck
          isPlaying={isPlaying}
          disabled={false}
          t={playbackT}
          duration={playbackDuration}
          events={events}
          canThrow={Boolean(play.passTarget) && !ballThrown && !drawMode && !isPlacingPassTarget}
          speed={speed}
          onSpeed={onSpeed}
          onTogglePlay={onTogglePlay}
          onRestart={onRestart}
          onScrub={onScrub}
          onThrowNow={throwNow}
        />
      </div>
    </div>
  );
}

export default forwardRef(FieldCanvas);
