import PlotBoard from "@/components/PlotBoard";
import { parsePlayState } from "@/lib/playSchema";
import { createClient } from "@/lib/supabase/server";

/**
 * A shared play, resolved on the server and handed to the board as its initial
 * state, so the link works without a client-side fetch waterfall.
 *
 * When the database cannot produce the play, this does *not* 404: the id may
 * belong to a play that was saved to the visitor's own browser because the
 * cloud write failed. The board retries against local storage on mount and
 * only then reports it missing.
 */
export default async function SharedPlayPage(props: PageProps<"/play/[id]">) {
  // `params` is a Promise as of Next.js 16.
  const { id } = await props.params;

  let play = null;
  try {
    const supabase = await createClient();
    // A malformed id makes Postgres fail the uuid cast; treat that as a miss.
    const { data, error } = await supabase.from("plays").select("data").eq("id", id).maybeSingle();
    if (error) console.error("[SharedPlayPage] fetch failed:", error.message);
    // Rows are publicly writable, so validate rather than trust what comes back.
    else if (data) play = parsePlayState(data.data);
  } catch (err) {
    console.error("[SharedPlayPage] unexpected error:", err);
  }

  if (play) return <PlotBoard initialPlay={play} />;
  return <PlotBoard fallbackId={id} />;
}
