import type { PlayState } from "./types";

/**
 * The slice of a play that undo/redo tracks: alignments, routes and the pass
 * target. Formation and coverage selections are treated as view settings and
 * deliberately excluded, since re-picking them is already a single click.
 */
export interface Snapshot {
  players: { id: string; startX: number; startY: number }[];
  routes: Record<string, { x: number; y: number }[]>;
  passTarget: PlayState["passTarget"];
}

export function snapshot(play: PlayState): Snapshot {
  return {
    players: play.players.map((p) => ({ id: p.id, startX: p.startX, startY: p.startY })),
    routes: Object.fromEntries(
      Object.entries(play.routes).map(([id, pts]) => [id, pts.map((p) => ({ x: p.x, y: p.y }))])
    ),
    passTarget: play.passTarget ? { ...play.passTarget } : null,
  };
}

/** Applies a snapshot onto a play, returning a new play object. */
export function restore(play: PlayState, snap: Snapshot): PlayState {
  const byId = new Map(snap.players.map((p) => [p.id, p]));
  return {
    ...play,
    players: play.players.map((p) => {
      const s = byId.get(p.id);
      return s ? { ...p, startX: s.startX, startY: s.startY } : p;
    }),
    routes: Object.fromEntries(
      Object.entries(snap.routes).map(([id, pts]) => [id, pts.map((p) => ({ ...p }))])
    ),
    passTarget: snap.passTarget ? { ...snap.passTarget } : null,
  };
}

const LIMIT = 100;

/**
 * Undo/redo over immutable snapshots.
 *
 * `commit` is called with the state as it was *before* an edit, so callers
 * record the prior state at the moment an interaction completes (a drag ends,
 * a route is finished, a preset is applied, a target is placed).
 */
export class History {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Records the pre-edit state. Any redo branch is discarded. */
  commit(before: Snapshot) {
    this.undoStack.push(before);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Returns the state to move to, given the current state, or null. */
  undo(current: Snapshot): Snapshot | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(current);
    return prev;
  }

  redo(current: Snapshot): Snapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    return next;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
