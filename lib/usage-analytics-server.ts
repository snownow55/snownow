import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { UsageEvent } from "./usage-analytics";
export async function storeUsageEvents(events: UsageEvent[]): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.USAGE_ANALYTICS_SUPABASE_SERVICE_KEY;
  const expected = process.env.VERCEL_ENV === "production" ? "https://rtgqyctqjfoercdymssd.supabase.co" : "https://viidjrhaoxcvunbfdbni.supabase.co";
  if (url !== expected || !key) return false;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(2500) }) } });
  try { const { error } = await client.rpc("record_usage_events", { p_batch: events }); return !error; } catch { return false; }
}
