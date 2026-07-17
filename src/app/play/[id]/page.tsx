import { notFound } from "next/navigation";
import PlotBoard from "@/components/PlotBoard";
import { parsePlayState } from "@/lib/playSchema";
import { createClient } from "@/lib/supabase/server";

/**
 * A shared play, fetched on the server and handed to the board as its initial
 * state. Rendering the play server-side means the link works without a
 * client-side fetch waterfall.
 */
export default async function SharedPlayPage(props: PageProps<"/play/[id]">) {
  // `params` is a Promise as of Next.js 16.
  const { id } = await props.params;

  const supabase = await createClient();
  const { data, error } = await supabase.from("plays").select("data").eq("id", id).maybeSingle();

  if (error) {
    console.error("[SharedPlayPage] fetch failed:", error.message);
    notFound();
  }
  if (!data) notFound();

  // Rows are publicly writable, so validate rather than trust what comes back.
  const play = parsePlayState(data.data);
  if (!play) notFound();

  return <PlotBoard initialPlay={play} />;
}
