"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sharePlay } from "@/app/actions";
import { buildFormation } from "@/lib/formations";
import { downloadBlob, recordPlayGif } from "@/lib/gif";
import { History, restore, snapshot, type Snapshot } from "@/lib/history";
import { serializePlayState } from "@/lib/playSchema";
import { buildPresetRoute } from "@/lib/routePresets";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { CoverageId, FormationId, PlayState, RoutePresetId } from "@/lib/types";
import FieldCanvas from "./FieldCanvas";
import LeftPanel from "./LeftPanel";
import RightPanel, { type ActionState } from "./RightPanel";

export function createDefaultPlay(): PlayState {
  return {
    formation: "shotgun-spread",
    coverage: "man",
    players: buildFormation("shotgun-spread"),
    routes: {},
    passTarget: null,
  };
}

export default function PlotBoard({ initialPlay }: { initialPlay?: PlayState }) {
  const [play, setPlay] = useState<PlayState>(() => initialPlay ?? createDefaultPlay());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [runId, setRunId] = useState(0);
  const [resetId, setResetId] = useState(0);
  const [shareState, setShareState] = useState<ActionState>({ status: "idle" });
  const [exportState, setExportState] = useState<ActionState>({ status: "idle" });

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

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, ignoring keystrokes aimed at form fields.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (locked) return;

      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, locked]);

  const onFormation = (formation: FormationId) => {
    // A new formation moves everyone, which would orphan existing routes.
    edit({
      ...play,
      formation,
      players: buildFormation(formation),
      routes: {},
      passTarget: null,
    });
    setSelectedId(null);
  };

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

  const onTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    setSelectedId(null);
    setRunId((v) => v + 1);
    setIsPlaying(true);
  };

  const onReset = () => {
    setIsPlaying(false);
    setResetId((v) => v + 1);
  };

  const onShare = async () => {
    setShareState({ status: "busy", message: "Saving play…" });
    try {
      const result = await sharePlay(serializePlayState(play));
      if (!result.ok) {
        setShareState({ status: "error", message: result.error });
        return;
      }

      const url = `${window.location.origin}/play/${result.id}`;
      try {
        await navigator.clipboard.writeText(url);
        setShareState({ status: "done", message: `Link copied — ${url}` });
      } catch {
        // Clipboard access needs a secure context and can be denied outright,
        // so fall back to showing the link rather than losing it.
        setShareState({ status: "done", message: `Saved — ${url}` });
      }
    } catch (err) {
      setShareState({
        status: "error",
        message: err instanceof Error ? err.message : "Sharing failed.",
      });
    }
  };

  const onExport = async () => {
    setIsPlaying(false);
    setResetId((v) => v + 1);
    setExportState({ status: "busy", message: "Recording frames…" });
    try {
      const blob = await recordPlayGif(play, (p) => {
        setExportState({ status: "busy", message: `Rendering… ${Math.round(p * 100)}%` });
      });
      downloadBlob(blob, `plotboard-${play.formation}-${Date.now()}.gif`);
      setExportState({ status: "done", message: "GIF downloaded." });
    } catch (err) {
      setExportState({
        status: "error",
        message: err instanceof Error ? err.message : "Export failed.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#E5E7EB]">
      <header className="flex items-center justify-between border-b border-[#1F2937] bg-[#0F172A] px-4 py-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[15px] font-bold tracking-tight text-[#F8FAFC]">PlotBoard</h1>
          <span className="text-[12px] text-[#6B7280]">Playbook Designer &amp; Simulator</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[#6B7280]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2563EB]" />
            Offense
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#DC2626]" />
            Defense
          </span>
        </div>
      </header>

      <div className="grid items-start gap-4 p-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <LeftPanel
          formation={play.formation}
          coverage={play.coverage}
          speed={speed}
          isPlaying={isPlaying}
          disabled={isExporting}
          onFormation={onFormation}
          onCoverage={onCoverage}
          onSpeed={setSpeed}
          onTogglePlay={onTogglePlay}
          onReset={onReset}
        />

        <main className="flex flex-col gap-3">
          <div className="relative border border-[#1F2937] bg-[#111827] p-2">
            <FieldCanvas
              play={play}
              selectedId={selectedId}
              isPlaying={isPlaying}
              speed={speed}
              runId={runId}
              resetId={resetId}
              onSelect={setSelectedId}
              onPlayChange={setPlay}
              onCommit={commit}
              onFinished={() => setIsPlaying(false)}
            />

            {isExporting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0B0F19]/85">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#374151] border-t-[#3B82F6]" />
                <p className="text-[12px] text-[#9CA3AF]">
                  {exportState.status === "busy" ? exportState.message : "Rendering…"}
                </p>
              </div>
            )}
          </div>

          <p className="text-[12px] leading-relaxed text-[#6B7280]">
            Click a player to select. Drag a player to move them. With a receiver selected, drag on
            open field to draw a route. Select the QB, then click along a receiver&apos;s route to
            place the pass target.
          </p>
        </main>

        <RightPanel
          selected={selected}
          hasRoute={hasRoute}
          canUndo={canUndo}
          canRedo={canRedo}
          disabled={locked}
          shareEnabled={shareEnabled}
          shareState={shareState}
          exportState={exportState}
          onPreset={onPreset}
          onClearRoute={onClearRoute}
          onUndo={undo}
          onRedo={redo}
          onShare={onShare}
          onExport={onExport}
        />
      </div>
    </div>
  );
}
