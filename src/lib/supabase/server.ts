import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * `cookies()` is async as of Next.js 16, so this must be awaited. The client is
 * created per request and never cached across requests, because it closes over
 * that request's cookie store.
 */
export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot mutate cookies. Safe to swallow: PlotBoard
          // is unauthenticated, so there is no session to refresh and this is
          // only ever reached if auth is added later without a proxy in place.
        }
      },
    },
  });
}
