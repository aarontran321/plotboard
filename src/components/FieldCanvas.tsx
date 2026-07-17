"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type View,
} from "@/lib/field";
import { flattenPath, nearestOnPath } from "@/lib/geometry";
import { snapshot, type Snapshot } from "@/lib/history";
import { drawField, drawScene } from "@/lib/render";
import { createContext, createInitialSim, stepSim, type SimContext } from "@/lib/simulation";
import type { PlayState, Point, SimState } from "@/lib/types";

interface Props {
  play: PlayState;
  selectedId: string | null;
  isPlaying: boolean;
  /** When true a drag from a player draws their route; otherwise it moves them. */
  drawMode: boolean;
  /** Playback rate multiplier. */
  speed: number;
  /** Increments to start a fresh simulation run. */
  runId: number;
  /** Increments to clear the simulation and return players to their alignment. */
  resetId: number;
  /**
   * Increments when the roster is rebuilt, to ease players from where they were
   * to their new alignment.
   */
  transitionId: number;
  onSelect: (id: string | null) => void;
  onPlayChange: (next: PlayState) => void;
  /** Called once an interaction completes, with the state from before it began. */
  onCommit: (before: Snapshot) => void;
  onFinished: () => void;
}

/**
 * The gesture currently in progress on the canvas.
 *
 * `drag` and `route` are mutually exclusive by construction: which one a
 * pointerdown produces is decided once, up front, from `drawMode`. Nothing
 * downstream re-decides, so a move can never turn into a draw mid-gesture.
 */
type Interaction =
  | { kind: "none" }
  | { kind: "drag"; id: string; before: Snapshot }
  | { kind: "route"; id: string; before: Snapshot }
  | { kind: "los"; before: Snapshot };

/** Milliseconds a formation change takes to ease into place. */
const TRANSITION_MS = 340;

/** Seconds a boundary-violation warning ring stays visible. */
const WARN_MS = 450;

/** Minimum spacing between sampled route points, in yards. */
const ROUTE_SAMPLE_SPACING = 0.7;

/** A drawn route shorter than this is treated as a stray click. */
const MIN_ROUTE_LENGTH = 1.5;

/** Largest frame step the sim will accept, so a stalled tab cannot teleport players. */
const MAX_FRAME_DT = 1 / 20;

export default function FieldCanvas({
  play,
  selectedId,
  isPlaying,
  drawMode,
  speed,
  runId,
  resetId,
  transitionId,
  onSelect,
  onPlayChange,
  onCommit,
  onFinished,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>(() => makeView(960));

  // The animation loop reads live values through refs so that re-renders never
  // tear down and restart it. Syncing happens in an effect rather than during
  // render, since a render may be discarded or replayed.
  const latest = useRef({ play, selectedId, isPlaying, drawMode, speed, onFinished });
  const viewRef = useRef(view);

  useEffect(() => {
    latest.current = { play, selectedId, isPlaying, drawMode, speed, onFinished };
    viewRef.current = view;
  });

  const simRef = useRef<{ ctx: SimContext; sim: SimState } | null>(null);
  /** Guards `onFinished` so a resolved play reports completion exactly once. */
  const notifiedRef = useRef(false);
  const interactionRef = useRef<Interaction>({ kind: "none" });
  const draftRef = useRef<Point[] | null>(null);
  const fieldCacheRef = useRef<HTMLCanvasElement | null>(null);
  /** Ghost-target cursor position while the QB is selected and idle. */
  const hoverTargetRef = useRef<Point | null>(null);
  /** Marching-dash phase for the QB throw guides. */
  const qbDashRef = useRef(0);
  /** True while the pointer is over, or dragging, the line of scrimmage. */
  const losActiveRef = useRef(false);
  /** Player id -> timestamp of their last boundary violation. */
  const warnRef = useRef<Record<string, number>>({});
  /** In-flight formation transition: where each player is easing from. */
  const transitionRef = useRef<{ from: Record<string, Point>; startedAt: number } | null>(null);

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

    // Rebuild the cached field at the new size.
    const cache = document.createElement("canvas");
    cache.width = Math.round(view.width * dpr);
    cache.height = Math.round(view.height * dpr);
    const cctx = cache.getContext("2d");
    if (cctx) {
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawField(cctx, view);
      fieldCacheRef.current = cache;
    }
  }, [view]);

  // --- Simulation lifecycle -----------------------------------------------

  useEffect(() => {
    if (runId === 0) return;
    const ctx = createContext(latest.current.play);
    simRef.current = { ctx, sim: createInitialSim(ctx) };
    notifiedRef.current = false;
  }, [runId]);

  useEffect(() => {
    if (resetId === 0) return;
    simRef.current = null;
    notifiedRef.current = false;
  }, [resetId]);

  // --- Rendering ----------------------------------------------------------

  /** Ease-out, so a formation change decelerates into its alignment. */
  const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

  /** Paints the current state once. Reads refs, so it is safe to call anywhere. */
  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { play: p, selectedId: sel, isPlaying: playing, drawMode: drawing } = latest.current;
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

    drawScene(ctx, viewRef.current, {
      play: p,
      sim: simRef.current?.sim ?? null,
      selectedId: sel,
      draftRoute: draftRef.current,
      qbGuide:
        sel === "QB" && !playing && !drawing
          ? { dashOffset: qbDashRef.current, hoverTarget: hoverTargetRef.current }
          : null,
      losActive: losActiveRef.current && !playing,
      drawMode: drawing,
      warnings,
      transition,
      background: fieldCacheRef.current,
    });
  }, []);

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
        if (active.sim.finished && !notifiedRef.current) {
          notifiedRef.current = true;
          latest.current.onFinished();
        }
      }

      draw();
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, draw]);

  // A deliberate, narrow exception to "no animation while idle": the QB throw
  // guides march to read as interactive discoverability hints, not decoration.
  // Scoped to QB selection only, so an idle board otherwise holds no frame.
  useEffect(() => {
    if (isPlaying || selectedId !== "QB" || drawMode) return;

    let raf = 0;
    const tick = () => {
      qbDashRef.current = (qbDashRef.current + 0.35) % 1000;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, selectedId, drawMode, draw]);

  /**
   * Drives frames for the two transient idle animations (formation easing and
   * the boundary-warning flash) and stops the moment both are done, so an idle
   * board still holds no animation frame.
   */
  const pumpRef = useRef(0);
  const pump = useCallback(() => {
    if (pumpRef.current) return;
    const tick = () => {
      // `draw` retires finished transitions and expired warnings as it renders,
      // so this reads their state afterwards to decide whether to keep going.
      draw();
      const busy = transitionRef.current !== null || Object.keys(warnRef.current).length > 0;
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

    // Any edit invalidates a paused or completed run.
    simRef.current = null;

    const world = pointerToWorld(e);
    const before = snapshot(play);
    const capture = () => e.currentTarget.setPointerCapture(e.pointerId);

    // 1. A player under the cursor always wins the gesture.
    const hitId = playerAt(world);
    if (hitId) {
      const player = play.players.find((p) => p.id === hitId)!;
      onSelect(hitId);

      if (drawMode && player.team === "offense") {
        startRoute(player, world, before);
      } else {
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

    onSelect(null);
  };

  /** Hover feedback only — runs when no gesture is in progress. */
  const onHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    const world = pointerToWorld(e);
    let repaint = false;

    const overLos = nearLos(world) && !playerAt(world);
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

  // The cursor is the cheapest signal for which gesture a drag will produce.
  const canvasCursor = isPlaying ? "default" : drawMode ? "crosshair" : "grab";

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onPointerLeave={() => {
          if (interactionRef.current.kind !== "none") return;
          if (!hoverTargetRef.current && !losActiveRef.current) return;
          hoverTargetRef.current = null;
          losActiveRef.current = false;
          draw();
        }}
        className="block w-full touch-none border border-[#1F2937]"
        style={{ cursor: canvasCursor }}
      />
    </div>
  );
}
