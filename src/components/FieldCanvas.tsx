"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PLAYER_HIT_RADIUS,
  ROUTE_HIT_RADIUS,
  clampToField,
  dist,
  makeView,
  toWorld,
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
  /** Playback rate multiplier. */
  speed: number;
  /** Increments to start a fresh simulation run. */
  runId: number;
  /** Increments to clear the simulation and return players to their alignment. */
  resetId: number;
  onSelect: (id: string | null) => void;
  onPlayChange: (next: PlayState) => void;
  /** Called once an interaction completes, with the state from before it began. */
  onCommit: (before: Snapshot) => void;
  onFinished: () => void;
}

/** The gesture currently in progress on the canvas. */
type Interaction =
  | { kind: "none" }
  | { kind: "drag"; id: string; before: Snapshot }
  | { kind: "route"; id: string; before: Snapshot };

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
  speed,
  runId,
  resetId,
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
  const latest = useRef({ play, selectedId, isPlaying, speed, onFinished });
  const viewRef = useRef(view);

  useEffect(() => {
    latest.current = { play, selectedId, isPlaying, speed, onFinished };
    viewRef.current = view;
  });

  const simRef = useRef<{ ctx: SimContext; sim: SimState } | null>(null);
  /** Guards `onFinished` so a resolved play reports completion exactly once. */
  const notifiedRef = useRef(false);
  const interactionRef = useRef<Interaction>({ kind: "none" });
  const draftRef = useRef<Point[] | null>(null);
  const fieldCacheRef = useRef<HTMLCanvasElement | null>(null);

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

  /** Paints the current state once. Reads refs, so it is safe to call anywhere. */
  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { play: p, selectedId: sel } = latest.current;

    drawScene(ctx, viewRef.current, {
      play: p,
      sim: simRef.current?.sim ?? null,
      selectedId: sel,
      draftRoute: draftRef.current,
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

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;

    // Any edit invalidates a paused or completed run.
    simRef.current = null;

    const world = pointerToWorld(e);
    const before = snapshot(play);

    const hitId = playerAt(world);
    if (hitId) {
      onSelect(hitId);
      interactionRef.current = { kind: "drag", id: hitId, before };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const selected = play.players.find((p) => p.id === selectedId);
    if (!selected || selected.team !== "offense") {
      onSelect(null);
      return;
    }

    // With the quarterback selected, a click on a receiver's route sets the
    // pass target rather than starting a route for the quarterback himself.
    if (selected.id === "QB") {
      const hit = routePointAt(world);
      if (hit) {
        onCommit(before);
        onPlayChange({
          ...play,
          passTarget: { x: hit.point.x, y: hit.point.y, receiverId: hit.receiverId, t: hit.t },
        });
        return;
      }
    }

    draftRef.current = [{ x: selected.startX, y: selected.startY }, world];
    interactionRef.current = { kind: "route", id: selected.id, before };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction.kind === "none") return;

    const raw = pointerToWorld(e);
    const world = clampToField(raw.x, raw.y);

    if (interaction.kind === "drag") {
      const player = play.players.find((p) => p.id === interaction.id);
      if (!player) return;
      const dx = world.x - player.startX;
      const dy = world.y - player.startY;

      // Drag the player's route along with them, so the shape is preserved.
      const routes = { ...play.routes };
      const own = routes[interaction.id];
      if (own) routes[interaction.id] = own.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));

      onPlayChange({
        ...play,
        players: play.players.map((p) =>
          p.id === interaction.id ? { ...p, startX: world.x, startY: world.y } : p
        ),
        routes,
        // The target rides the receiver's route, so moving that receiver drops it.
        passTarget: play.passTarget?.receiverId === interaction.id ? null : play.passTarget,
      });
      return;
    }

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

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        className="block w-full touch-none border border-[#1F2937]"
        style={{ cursor: isPlaying ? "default" : "crosshair" }}
      />
    </div>
  );
}
