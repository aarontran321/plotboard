/**
 * Naming rules for a play, in one place.
 *
 * A play's stored `name` is whatever the user typed, and is allowed to be
 * empty. The *display* name — the one that ends up on a saved entry, a GIF
 * filename, or a share row — is derived on demand by `resolvePlayName`.
 *
 * Keeping those separate matters: the default name contains a timestamp, so
 * computing it during render would produce different markup on the server and
 * the client and break hydration. Only call `resolvePlayName` from an event
 * handler or an effect.
 */

/** Matches the `name` cap enforced by the schema at the trust boundary. */
export const MAX_PLAY_NAME_LENGTH = 80;

/** Names an unnamed play by when it was created. */
export function defaultPlayName(now: Date = new Date()): string {
  const stamp = now.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Untitled Play - ${stamp}`;
}

/**
 * The name to actually use: what the user typed, trimmed and capped, or a
 * timestamped default when they left it blank.
 */
export function resolvePlayName(raw: string | null | undefined, now?: Date): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return defaultPlayName(now);
  return trimmed.slice(0, MAX_PLAY_NAME_LENGTH);
}

/**
 * A filename-safe slug for a play name. Falls back to "play" so that a name of
 * nothing but punctuation cannot produce a file called ".gif".
 */
export function playNameSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "play";
}
