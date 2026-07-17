import { parsePlayState, serializePlayState } from "./playSchema";
import type { PlayState } from "./types";

/**
 * The user's named play library, in `localStorage`.
 *
 * Deliberately separate from `localPlays.ts`, which looks similar but is a
 * different concern: that one is the invisible fallback for a failed *share*,
 * keyed by the share id that ends up in a URL. This one is a user-facing list
 * of plays they chose to keep, and it owns its own ordering and names.
 *
 * Everything here is defensive. `localStorage` is user-editable, can be absent
 * (SSR, or a browser with storage disabled), and can throw on write when the
 * quota is full or the page is in a private window. A play library failing is
 * never worth taking the board down for, so reads degrade to an empty list and
 * writes report failure to the caller.
 */

/** One key holding the whole library: small payloads, and ordering comes free. */
const KEY = "plotboard:saved-plays";

/** Guard against a runaway library filling the origin's storage quota. */
const MAX_SAVED_PLAYS = 100;

export interface SavedPlay {
  id: string;
  name: string;
  /** Epoch milliseconds, used for ordering. */
  savedAt: number;
  play: PlayState;
}

/** What the list view needs, without deserialising every board. */
export type SavedPlaySummary = Omit<SavedPlay, "play">;

function storage(): Storage | null {
  try {
    // Touching `localStorage` itself throws in some privacy configurations,
    // so the access is inside the try, not just the call.
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads and validates the library. Entries that no longer parse are dropped
 * rather than failing the whole read — one bad play should not cost the user
 * the rest of their list.
 */
function readAll(): SavedPlay[] {
  const store = storage();
  if (!store) return [];

  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const out: SavedPlay[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { id, name, savedAt, play } = entry as Record<string, unknown>;
      if (typeof id !== "string" || typeof name !== "string") continue;
      if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) continue;
      // Same validation as the database path: local storage is no more trusted
      // than a public table.
      const valid = parsePlayState(play);
      if (!valid) continue;
      out.push({ id, name, savedAt, play: valid });
    }
    return out;
  } catch {
    return [];
  }
}

function writeAll(plays: SavedPlay[]): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(KEY, JSON.stringify(plays));
    return true;
  } catch {
    // Quota exceeded, or storage is read-only.
    return false;
  }
}

/** The library, newest first. */
export function listSavedPlays(): SavedPlaySummary[] {
  return readAll()
    .sort((a, b) => b.savedAt - a.savedAt)
    .map(({ id, name, savedAt }) => ({ id, name, savedAt }));
}

export type SaveResult =
  | { ok: true; saved: SavedPlaySummary }
  | { ok: false; error: string };

/**
 * Saves a play under `name`.
 *
 * Saving the same name twice overwrites that entry rather than accumulating
 * duplicates the user cannot tell apart — re-saving reads as "update", which
 * is what pressing Save again means.
 */
export function saveNamedPlay(play: PlayState, name: string): SaveResult {
  if (!storage()) return { ok: false, error: "This browser has storage disabled." };

  const all = readAll();
  // Store exactly the fields that persist elsewhere, so a saved play and a
  // shared play are the same payload.
  const stored: PlayState = serializePlayState({ ...play, name });

  const existing = all.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
  const entry: SavedPlay = {
    id: existing >= 0 ? all[existing].id : crypto.randomUUID(),
    name,
    savedAt: Date.now(),
    play: stored,
  };

  const next = existing >= 0 ? all.map((p, i) => (i === existing ? entry : p)) : [entry, ...all];
  if (next.length > MAX_SAVED_PLAYS) {
    next.sort((a, b) => b.savedAt - a.savedAt);
    next.length = MAX_SAVED_PLAYS;
  }

  if (!writeAll(next)) {
    return { ok: false, error: "Could not save — this browser's storage is full." };
  }
  return { ok: true, saved: { id: entry.id, name: entry.name, savedAt: entry.savedAt } };
}

/** Returns null for a missing or no-longer-valid entry. */
export function loadSavedPlay(id: string): PlayState | null {
  return readAll().find((p) => p.id === id)?.play ?? null;
}

export function deleteSavedPlay(id: string): boolean {
  const all = readAll();
  const next = all.filter((p) => p.id !== id);
  if (next.length === all.length) return false;
  return writeAll(next);
}
