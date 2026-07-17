import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/**
 * Supabase client for use inside Client Components.
 *
 * `createBrowserClient` memoizes internally, so calling this per render is fine.
 */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
