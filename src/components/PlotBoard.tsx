"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sharePlay } from "@/app/actions";
import { LOS_X, type FieldTheme } from "@/lib/field";
import { buildFormation } from "@/lib/formations";
import { flattenPath, pointAtT } from "@/lib/geometry";
import { downloadBlob, recordPlayGif } from "@/lib/gif";
import { History, restore, snapshot, type Snapshot } from "@/lib/history";
import { loadPlayLocal, savePlayLocal } from "@/lib/localPlays";
import { hasCompletedOnboardingTour, markOnboardingTourComplete } from "@/lib/onboarding";
import { playNameSlug, resolvePlayName } from "@/lib/playName";
import { serializePlayState } from "@/lib/playSchema";
import { buildPresetRoute } from "@/lib/routePresets";
import {
  deleteSavedPlay,
  listSavedPlays,
  loadSavedPlay,
  saveNamedPlay,
  type SavedPlaySummary,
} from "@/lib/savedPlays";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  CoverageId,
  DefenseFormationId,
  FormationId,
  PassTarget,
  PlayState,
  RoutePresetId,
  SimState,
} from "@/lib/types";
import FieldCanvas, { type FieldCanvasHandle } from "./FieldCanvas";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import LeftPanel from "./LeftPanel";
import NamePlayDialog from "./NamePlayDialog";
import OnboardingTour, { type TourSection } from "./OnboardingTour";
import { FRAME_STEP } from "./PlaybackDeck";
import PlayChat from "./PlayChat";
import PlayNameBar from "./PlayNameBar";
import RightPanel, { type ActionState } from "./RightPanel";
import ShareModal, { type ShareModalState } from "./ShareModal";
import { CollapseButton } from "./ui";

/**
 * The board is never empty on first load: it boots with a Go/Slant/Curl combo
 * and a target already placed, so Simulate does something meaningful before the
 * user has drawn anything.
 */
export function createDefaultPlay(): PlayState {
  const players = buildFormation("spread", "4-3", LOS_X);
  const at = (id: string) => {
    const p = players.find((x) => x.id === id)!;
    return { x: p.startX, y: p.startY };
  };

  const routes = {
    WR1: buildPresetRoute("go", at("WR1")),
    WR2: buildPresetRoute("curl", at("WR2")),
    WR3: buildPresetRoute("slant", at("WR3")),
  };

  // Drop the target three-quarters of the way down the go route.
  const path = flattenPath(routes.WR1);
  const spot = pointAtT(path, 0.75);

  return {
    // Unnamed: the default name carries a timestamp, so materialising one here
    // would differ between the server render and the client and break hydration.
    name: "",
    formation: "spread",
    defenseFormation: "4-3",
    coverage: "man",
    losX: LOS_X,
    players,
    routes,
    passTarget: { x: spot.x, y: spot.y, receiverId: "WR1", t: 0.75 },
    assignments: {},
    callNotes: { downDistance: "", counters: "", risks: "" },
  };
}

interface PlotBoardProps {
  /** A play resolved server-side from the database. */
  initialPlay?: PlayState;
  /**
   * A share id the database did not have. The play may still be in this
   * browser's local storage, from a share that fell back when the cloud write
   * failed.
   */
  fallbackId?: string;
}

export default function PlotBoard({ initialPlay, fallbackId }: PlotBoardProps) {
  const [play, setPlay] = useState<PlayState>(() => initialPlay ?? createDefaultPlay());
  const [missingShare, setMissingShare] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [isPlacingPassTarget, setIsPlacingPassTarget] = useState(false);
  const [theme, setTheme] = useState<FieldTheme>("turf");
  const [speed, setSpeed] = useState(1);
  const [resetId, setResetId] = useState(0);
  const [transitionId, setTransitionId] = useState(0);
  const [shareModal, setShareModal] = useState<ShareModalState>({ status: "closed" });
  const [exportState, setExportState] = useState<ActionState>({ status: "idle" });
  const [saveState, setSaveState] = useState<ActionState>({ status: "idle" });

  /**
   * The play dashboard (keyframe timeline, live analytics, coaching grid)
   * mirrors the same playhead `FieldCanvas`'s own `PlaybackDeck` drives, via
   * `onPlaybackUpdate` below — it does not own a second notion of "where we
   * are in the play". `fieldCanvasRef` is the other half of that: it lets the
   * dashboard's timeline drive the playhead back (e.g. clicking an event
   * marker to seek), reusing the exact same scrub/step FieldCanvas already
   * implements for its own deck rather than a second implementation.
   */
  const fieldCanvasRef = useRef<FieldCanvasHandle>(null);
  // Stable wrappers the onboarding tour measures and spotlights — stable
  // across the collapse/expand toggle so a ref never goes stale mid-tour.
  const leftPanelElRef = useRef<HTMLDivElement>(null);
  const rightPanelElRef = useRef<HTMLDivElement>(null);
  const chatCardElRef = useRef<HTMLDivElement>(null);
  const [playback, setPlayback] = useState<{ t: number; duration: number; sim: SimState | null }>({
    t: 0,
    duration: 0,
    sim: null,
  });

  // The play library lives in localStorage, which does not exist during SSR, so
  // it is read after mount and mirrored here.
  const [savedPlays, setSavedPlays] = useState<SavedPlaySummary[]>([]);
  /** Which library entry is on the board, so the list can show what's loaded. */
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [gifDialogOpen, setGifDialogOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Collateral panels can be tucked away to give the field more room on
  // smaller screens; the field itself already resizes to fill whatever width
  // its wrapper has via `FieldCanvas`'s `ResizeObserver`, so collapsing a
  // column needs no extra wiring beyond changing that column's width.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const [tourOpen, setTourOpen] = useState(false);

  /*
   * First-time visitors get the tour automatically; everyone else can
   * replay it from the shortcuts modal. Reading localStorage only after
   * mount (never in a `useState` initialiser) avoids a hydration mismatch —
   * the server has no notion of "has this browser seen the tour before".
   */
  /* eslint-disable react-hooks/set-state-in-effect -- see note above */
  useEffect(() => {
    if (!hasCompletedOnboardingTour()) setTourOpen(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /*
   * The tour spotlights the formations and active-element panels, which
   * makes no sense collapsed — force them open for the run and restore
   * whatever the user had the moment it started.
   */
  useEffect(() => {
    if (!tourOpen) return;
    const wasLeftCollapsed = leftCollapsed;
    const wasRightCollapsed = rightCollapsed;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing UI to the tour's on/off state
    if (wasLeftCollapsed) setLeftCollapsed(false);
    if (wasRightCollapsed) setRightCollapsed(false);
    return () => {
      setLeftCollapsed(wasLeftCollapsed);
      setRightCollapsed(wasRightCollapsed);
    };
    // Deliberately only re-runs on `tourOpen`: it captures whatever collapse
    // state was true the moment the tour opened, not a live mirror of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen]);

  /** Where the tour finds the live DOM node(s) for each section it spotlights. */
  const getTourSectionEls = useCallback((section: TourSection): HTMLElement[] => {
    switch (section) {
      case "field": {
        const el = fieldCanvasRef.current?.getCanvasEl();
        return el ? [el] : [];
      }
      case "bottom": {
        const deck = fieldCanvasRef.current?.getDeckEl();
        const chat = chatCardElRef.current;
        const els: (HTMLElement | null | undefined)[] = [deck, chat];
        return els.filter((x): x is HTMLElement => Boolean(x));
      }
      case "left":
        return leftPanelElRef.current ? [leftPanelElRef.current] : [];
      case "right":
        return rightPanelElRef.current ? [rightPanelElRef.current] : [];
    }
  }, []);

  const onTourExit = useCallback((completed: boolean) => {
    setTourOpen(false);
    if (completed) markOnboardingTourComplete();
  }, []);

  const historyRef = useRef(new History());
  // History lives outside React, so its availability is mirrored into state.
  // Every mutation below calls `syncHistory` from an event handler, never
  // during render.
  const [{ canUndo, canRedo }, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const syncHistory = useCallback(() => {
    setHistoryState({
      canUndo: historyRef.current.canUndo,
      canRedo: historyRef.current.canRedo,
    });
  }, []);

  const shareEnabled = isSupabaseConfigured();
  const isExporting = exportState.status === "busy";
  const locked = isPlaying || isExporting;

  const selected = play.players.find((p) => p.id === selectedId) ?? null;
  const hasRoute = Boolean(selectedId && play.routes[selectedId]?.length);

  const commit = useCallback(
    (before: Snapshot) => {
      historyRef.current.commit(before);
      syncHistory();
    },
    [syncHistory]
  );

  /** Applies an edit and records the pre-edit state for undo in one step. */
  const edit = useCallback(
    (next: PlayState) => {
      commit(snapshot(play));
      setPlay(next);
      setResetId((v) => v + 1);
    },
    [commit, play]
  );

  const undo = useCallback(() => {
    const prev = historyRef.current.undo(snapshot(play));
    if (!prev) return;
    setPlay(restore(play, prev));
    setResetId((v) => v + 1);
    syncHistory();
  }, [play, syncHistory]);

  const redo = useCallback(() => {
    const next = historyRef.current.redo(snapshot(play));
    if (!next) return;
    setPlay(restore(play, next));
    setResetId((v) => v + 1);
    syncHistory();
  }, [play, syncHistory]);

  /*
   * A share link the server could not resolve may still be saved in this
   * browser, from a share that fell back when the cloud write failed.
   *
   * This reads an external store (localStorage) after mount, which is exactly
   * what an effect is for. It cannot move into a `useState` initialiser: that
   * runs during SSR too, where `localStorage` does not exist, and seeding it
   * client-side only would desync hydration from the server-rendered board.
   * Runs once — `fallbackId` is fixed for the lifetime of the route.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- see note above */
  useEffect(() => {
    if (!fallbackId || initialPlay) return;
    const local = loadPlayLocal(fallbackId);
    if (local) {
      setPlay(local);
      historyRef.current.clear();
      syncHistory();
    } else {
      setMissingShare(true);
    }
  }, [fallbackId, initialPlay, syncHistory]);

  /*
   * The saved play library, read once on mount. Same reasoning as above: this
   * is an external store that does not exist on the server, so it cannot seed
   * `useState` without desyncing hydration.
   */
  useEffect(() => {
    setSavedPlays(listSavedPlays());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Writes the current play into the library under the name in the input. */
  const onSavePlay = () => {
    const name = resolvePlayName(play.name);
    const result = saveNamedPlay(play, name);

    if (!result.ok) {
      setSaveState({ status: "error", message: result.error });
      return;
    }

    // A blank input resolved to a default name; show the user what it is called
    // now rather than leaving the field looking empty.
    if (play.name !== name) setPlay({ ...play, name });

    setSavedPlays(listSavedPlays());
    setActiveSavedId(result.saved.id);
    setSaveState({ status: "done", message: `Saved as "${name}".` });
  };

  const onLoadSaved = (id: string) => {
    const loaded = loadSavedPlay(id);
    if (!loaded) {
      // The entry failed validation on read and was dropped from the library.
      setSavedPlays(listSavedPlays());
      setSaveState({ status: "error", message: "That saved play could not be loaded." });
      return;
    }

    setPlay(loaded);
    setSelectedId(null);
    setIsPlaying(false);
    setIsPlacingPassTarget(false);
    setActiveSavedId(id);
    // A different play is a different history: the old stack's snapshots
    // describe a board that is no longer on screen.
    historyRef.current.clear();
    syncHistory();
    setResetId((v) => v + 1);
    setTransitionId((v) => v + 1);
    setSaveState({ status: "done", message: `Loaded "${loaded.name}".` });
  };

  const onDeleteSaved = (id: string) => {
    deleteSavedPlay(id);
    setSavedPlays(listSavedPlays());
    // Deleting the loaded play leaves it on the board; it is just no longer
    // backed by a library entry.
    if (activeSavedId === id) setActiveSavedId(null);
    setSaveState({ status: "idle" });
  };

  /**
   * Rebuilds the roster for a formation pair. A new formation moves everyone,
   * which would orphan existing routes, so they are cleared along with the
   * target that sat on one of them. `transitionId` tells the canvas to ease the
   * players from wherever they were into the new alignment.
   */
  const setFormations = (formation: FormationId, defenseFormation: DefenseFormationId) => {
    edit({
      ...play,
      formation,
      defenseFormation,
      players: buildFormation(formation, defenseFormation, play.losX),
      routes: {},
      passTarget: null,
    });
    setSelectedId(null);
    setIsPlacingPassTarget(false);
    setTransitionId((v) => v + 1);
  };

  const onFormation = (formation: FormationId) => setFormations(formation, play.defenseFormation);

  const onDefenseFormation = (defenseFormation: DefenseFormationId) =>
    setFormations(play.formation, defenseFormation);

  const onCoverage = (coverage: CoverageId) => edit({ ...play, coverage });

  const onPreset = (preset: RoutePresetId) => {
    if (!selected || selected.team !== "offense") return;
    const route = buildPresetRoute(preset, { x: selected.startX, y: selected.startY });
    edit({
      ...play,
      routes: { ...play.routes, [selected.id]: route },
      passTarget: play.passTarget?.receiverId === selected.id ? null : play.passTarget,
    });
  };

  const onClearRoute = () => {
    if (!selectedId) return;
    const routes = { ...play.routes };
    delete routes[selectedId];
    edit({
      ...play,
      routes,
      passTarget: play.passTarget?.receiverId === selectedId ? null : play.passTarget,
    });
  };

  const hasAnyRoutes = Object.keys(play.routes).length > 0;

  const onResetAllRoutes = () => {
    // Only offensive players ever hold a route, but filter explicitly rather
    // than assuming — this is the one place that clears everyone at once.
    const offenseIds = new Set(play.players.filter((p) => p.team === "offense").map((p) => p.id));
    const routes = Object.fromEntries(
      Object.entries(play.routes).filter(([id]) => !offenseIds.has(id))
    );
    edit({ ...play, routes, passTarget: null });
  };

  // Pausing freezes on the current frame — it does not rewind. The only
  // wrinkle is a *finished* play: pressing play there should start over rather
  // than sit on the final frame doing nothing, so it rewinds first.
  const onTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const finished = playback.duration > 0 && playback.t >= playback.duration - 0.001;
    if (finished) setResetId((v) => v + 1);
    setSelectedId(null);
    setIsPlaying(true);
  };

  // Restart rewinds to the first frame and leaves the play paused there.
  const onReset = () => {
    setIsPlaying(false);
    setResetId((v) => v + 1);
  };

  /** A pass target was placed via the dedicated Pass Target Tool; one placement
   *  completes the action, so the tool turns itself back off. */
  const onPlaceTarget = (target: PassTarget) => {
    edit({ ...play, passTarget: target });
    setIsPlacingPassTarget(false);
  };

  /*
   * Keyboard shortcuts. Space/R/Esc mirror the bindings this project already
   * established; Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z drive history.
   *
   * Declared after the handlers it calls, since a dependency array referencing
   * a `const` defined further down would evaluate before initialisation.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const key = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
        if (locked) return;
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
        return;
      }

      // "?" is Shift+/ on most layouts — checked before the blanket
      // Shift-modified-keys bail-out below, which is meant for combos this
      // project doesn't bind, not for the one key that needs Shift to type.
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (e.altKey || e.shiftKey) return;

      if (key === " " || key === "spacebar") {
        if (isExporting) return;
        // Space would otherwise scroll the page or re-trigger a focused button.
        e.preventDefault();
        onTogglePlay();
      } else if (key === "r") {
        if (isExporting) return;
        e.preventDefault();
        onReset();
      } else if (key === "d") {
        if (locked) return;
        e.preventDefault();
        setDrawMode((v) => !v);
      } else if (key === "t") {
        // Throw Now works precisely while playing (that's the point), so it
        // is not gated behind `locked` the way most editing shortcuts are —
        // only an export in progress blocks it.
        if (isExporting) return;
        e.preventDefault();
        fieldCanvasRef.current?.throwNow();
      } else if (key === "arrowleft" || key === "arrowright") {
        // Stepping fights the live animation loop over the same state, same
        // as the deck's own step buttons — so this is a no-op mid-playback
        // rather than an implicit pause.
        if (locked || isPlaying) return;
        e.preventDefault();
        fieldCanvasRef.current?.step(key === "arrowleft" ? -FRAME_STEP : FRAME_STEP);
      } else if (key === "escape") {
        setSelectedId(null);
        setIsPlacingPassTarget(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const onShare = async () => {
    setShareModal({ status: "saving" });

    // Every path that persists a play names it, so a shared link always arrives
    // with something in the recipient's name field.
    const name = resolvePlayName(play.name);
    const named: PlayState = { ...play, name };
    if (play.name !== name) setPlay(named);

    let remoteError: string | null = null;
    try {
      const result = await sharePlay(serializePlayState(named));
      if (result.ok) {
        setShareModal({ status: "ready", url: `${window.location.origin}/play/${result.id}` });
        return;
      }
      remoteError = result.error;
    } catch (err) {
      remoteError = err instanceof Error ? err.message : "Sharing failed.";
    }

    // The database write failed. Save locally rather than lose the play — the
    // link still works, just only in this browser.
    try {
      const id = savePlayLocal(named);
      setShareModal({ status: "ready", url: `${window.location.origin}/play/${id}` });
    } catch {
      setShareModal({ status: "error", message: remoteError ?? "Sharing failed." });
    }
  };

  /** Opens the naming step. The export itself runs from `onExportConfirmed`. */
  const onExport = () => {
    setIsPlaying(false);
    setGifDialogOpen(true);
  };

  /**
   * `rawName` is straight from the dialog: blank (including from Skip) resolves
   * to the default name rather than cancelling.
   */
  const onExportConfirmed = async (rawName: string) => {
    setGifDialogOpen(false);
    const name = resolvePlayName(rawName);

    // The name the user settled on in the dialog is the play's name now — it
    // would be strange for the GIF and the board to disagree.
    const named: PlayState = { ...play, name };
    if (play.name !== name) setPlay(named);

    setResetId((v) => v + 1);
    setExportState({ status: "busy", message: "Recording frames…" });
    try {
      const blob = await recordPlayGif(named, (p) => {
        setExportState({ status: "busy", message: `Rendering… ${Math.round(p * 100)}%` });
      });
      downloadBlob(blob, `${playNameSlug(name)}.gif`);
      setExportState({ status: "done", message: `Downloaded "${playNameSlug(name)}.gif".` });
    } catch (err) {
      setExportState({
        status: "error",
        message: err instanceof Error ? err.message : "Export failed.",
      });
    }
  };

  return (
    <div className="min-h-screen text-[#E5E7EB]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0a0e17]/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[15px] font-bold tracking-tight text-[#F8FAFC]">PlotBoard</h1>
          <span className="text-[12px] text-[#7C8AA5]">Playbook Designer &amp; Simulator</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[#7C8AA5]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#3B82F6] shadow-[0_0_8px_rgba(59,130,246,0.7)]" />
            Offense
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#DC2626] shadow-[0_0_8px_rgba(220,38,38,0.7)]" />
            Defense
          </span>
        </div>
      </header>

      <div
        className="grid items-start gap-4 p-4 lg:grid-cols-[var(--left-w)_minmax(0,1fr)_var(--right-w)]"
        style={
          {
            "--left-w": leftCollapsed ? "40px" : "240px",
            "--right-w": rightCollapsed ? "40px" : "280px",
          } as React.CSSProperties
        }
      >
        <div ref={leftPanelElRef}>
          {leftCollapsed ? (
            <div className="flex justify-center rounded-2xl border border-white/[0.07] bg-[#111827]/70 p-2 shadow-[0_12px_36px_-8px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              <CollapseButton glyph="»" label="Expand formations panel" onClick={() => setLeftCollapsed(false)} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex justify-end">
                <CollapseButton glyph="«" label="Collapse formations panel" onClick={() => setLeftCollapsed(true)} />
              </div>
              <LeftPanel
                formation={play.formation}
                defenseFormation={play.defenseFormation}
                coverage={play.coverage}
                speed={speed}
                drawMode={drawMode}
                theme={theme}
                disabled={isExporting}
                onFormation={onFormation}
                onDefenseFormation={onDefenseFormation}
                onCoverage={onCoverage}
                onSpeed={setSpeed}
                onDrawMode={(on) => {
                  setDrawMode(on);
                  if (on) setIsPlacingPassTarget(false);
                }}
                onTheme={setTheme}
              />
            </div>
          )}
        </div>

        <main className="flex flex-col gap-3">
          <PlayNameBar
            name={play.name}
            disabled={isExporting}
            onName={(name) => setPlay({ ...play, name })}
            onSave={onSavePlay}
            shareEnabled={shareEnabled}
            sharing={shareModal.status === "saving"}
            exportState={exportState}
            onShare={onShare}
            onExport={onExport}
          />

          {missingShare && (
            <div className="rounded-xl border border-rose-500/20 bg-[#2A161C]/70 px-3 py-2 text-[12px] text-[#FCA5A5] backdrop-blur-xl">
              That shared play isn&apos;t in the database, and isn&apos;t saved in this browser.
              Showing a fresh board instead.
            </div>
          )}

          {/* The field owns the full width of the centre column; the Play Chat
              feed sits beneath it rather than stealing a sidebar's worth of
              space from the board. */}
          <div className="relative rounded-2xl border border-white/[0.07] bg-[#111827]/70 p-2 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <FieldCanvas
              ref={fieldCanvasRef}
              play={play}
              selectedId={selectedId}
              isPlaying={isPlaying}
              drawMode={drawMode}
              speed={speed}
              resetId={resetId}
              transitionId={transitionId}
              isPlacingPassTarget={isPlacingPassTarget}
              theme={theme}
              onSelect={setSelectedId}
              onPlayChange={setPlay}
              onCommit={commit}
              onFinished={() => setIsPlaying(false)}
              onPlaceTarget={onPlaceTarget}
              onTogglePlay={onTogglePlay}
              onRestart={onReset}
              onPlaybackUpdate={setPlayback}
            />

            {isExporting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#0a0e17]/85 backdrop-blur-sm">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#374151] border-t-[#38BDF8] shadow-[0_0_12px_rgba(56,189,248,0.5)]" />
                <p className="text-[12px] text-[#9CA3AF]">
                  {exportState.status === "busy" ? exportState.message : "Rendering…"}
                </p>
              </div>
            )}
          </div>

          <div
            ref={chatCardElRef}
            className="rounded-2xl border border-white/[0.07] bg-[#111827]/70 p-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
          >
            <PlayChat
              play={play}
              playbackT={playback.t}
              disabled={locked}
              collapsed={chatCollapsed}
              onToggleCollapsed={() => setChatCollapsed((v) => !v)}
              onScrub={(t) => fieldCanvasRef.current?.scrub(t)}
            />
          </div>

          <p className="text-[12px] leading-relaxed text-[#7C8AA5]">
            {isPlacingPassTarget
              ? "Pass Target Tool is armed: click a route or receiver to snap the target, or click open field to drop a free target. Esc cancels."
              : drawMode
                ? "Draw Route Mode is on: drag from an offensive player to draw their route. Press D to go back to moving players."
                : "Drag players to reposition them — they are held on their own side of the neutral zone. Shift-click, or drag a box over open field, to select several as a group. Right-click a token for quick actions. Drag the blue line of scrimmage to move the whole play. Press D to draw routes."}
          </p>
        </main>

        <div ref={rightPanelElRef}>
          {rightCollapsed ? (
            <div className="flex justify-center rounded-2xl border border-white/[0.07] bg-[#111827]/70 p-2 shadow-[0_12px_36px_-8px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              <CollapseButton glyph="«" label="Expand active-element panel" onClick={() => setRightCollapsed(false)} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex justify-start">
                <CollapseButton glyph="»" label="Collapse active-element panel" onClick={() => setRightCollapsed(true)} />
              </div>
              <RightPanel
                selected={selected}
                hasRoute={hasRoute}
                hasAnyRoutes={hasAnyRoutes}
                drawMode={drawMode}
                isPlacingPassTarget={isPlacingPassTarget}
                onTogglePlacingPassTarget={() => setIsPlacingPassTarget((v) => !v)}
                canUndo={canUndo}
                canRedo={canRedo}
                disabled={locked}
                onPreset={onPreset}
                onClearRoute={onClearRoute}
                onResetAllRoutes={onResetAllRoutes}
                onUndo={undo}
                onRedo={redo}
                saveState={saveState}
                savedPlays={savedPlays}
                activeSavedId={activeSavedId}
                onLoadSaved={onLoadSaved}
                onDeleteSaved={onDeleteSaved}
              />
            </div>
          )}
        </div>
      </div>

      <NamePlayDialog
        open={gifDialogOpen}
        initialName={play.name}
        onConfirm={onExportConfirmed}
        onCancel={() => setGifDialogOpen(false)}
      />

      <ShareModal state={shareModal} onClose={() => setShareModal({ status: "closed" })} />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onOpen={() => setShortcutsOpen(true)}
        onClose={() => setShortcutsOpen(false)}
        onStartTour={() => {
          setShortcutsOpen(false);
          setTourOpen(true);
        }}
      />

      <OnboardingTour open={tourOpen} getSectionEls={getTourSectionEls} onExit={onTourExit} />
    </div>
  );
}
