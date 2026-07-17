"use server";

import { parsePlayState, serializePlayState } from "@/lib/playSchema";
import { createClient } from "@/lib/supabase/server";

export type ShareResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Persists a play and returns its id, which becomes the share URL's slug.
 *
 * The payload arrives from the browser, so it is re-validated here rather than
 * trusted: a Server Action is a public HTTP endpoint, not a private function.
 */
export async function sharePlay(input: unknown): Promise<ShareResult> {
  const play = parsePlayState(input);
  if (!play) return { ok: false, error: "That play could not be validated." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plays")
      // The play's name rides inside `data`, deliberately, and is *not* written
      // to the table's `name` column. That column exists in schema.sql but not
      // on the deployed table, which predates it — writing to it fails the
      // whole insert with PGRST204 and drops every share onto the localStorage
      // fallback. `data` is the source of truth either way, so depending on the
      // column buys nothing and costs the feature.
      .insert({ data: serializePlayState(play) })
      .select("id")
      .single();

    if (error) {
      // Surface the cause in server logs, but keep the client message generic.
      console.error("[sharePlay] insert failed:", error.message);
      return { ok: false, error: `Could not save the play: ${error.message}` };
    }

    return { ok: true, id: data.id as string };
  } catch (err) {
    console.error("[sharePlay] unexpected error:", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return { ok: false, error: message };
  }
}
