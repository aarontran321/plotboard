import { parsePlayState, serializePlayState } from "./playSchema";
import type { PlayState } from "./types";

/**
 * Browser-local play storage.
 *
 * This is the fallback half of Save & Share: if the Supabase write fails — no
 * table yet, no network, RLS says no — the play still gets saved here rather
 * than being lost. A locally-saved play produces a working link, but only in
 * the browser that made it.
 */

const PREFIX = "plotboard:play:";

/** Ids are only ever used as a URL slug and a storage key. */
function newId() {
  return crypto.randomUUID();
}

export function savePlayLocal(play: PlayState): string {
  const id = newId();
  localStorage.setItem(PREFIX + id, JSON.stringify(serializePlayState(play)));
  return id;
}

/** Returns null for a missing, unparseable, or invalid entry. */
export function loadPlayLocal(id: string): PlayState | null {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    // Same validation as the database path: localStorage is user-editable, so
    // it is no more trusted than a public table.
    return parsePlayState(JSON.parse(raw));
  } catch {
    return null;
  }
}
