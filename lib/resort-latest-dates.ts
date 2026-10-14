import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resort } from "./resort-master";

export const LATEST_DATES_ERROR = "投稿情報を取得できませんでした。";

// Sorting metadata only: never fetch post contents for a placeholder-only home.
// Filter before limit so another resort's >1,000 posts cannot hide this one.
export async function loadResortLatestDates(
  client: Pick<SupabaseClient, "from"> | null,
  resorts: readonly Resort[],
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  if (!client) throw new Error(LATEST_DATES_ERROR);
  const entries = await Promise.all(resorts.map(async (resort) => {
    let query = client.from("snow_posts").select("created_at")
      .eq("resort", resort.name).order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error || !Array.isArray(data) || data.length > 1) throw new Error(LATEST_DATES_ERROR);
    if (!data.length) return null;
    const date = data[0]?.created_at;
    if (typeof date !== "string" || !Number.isFinite(Date.parse(date))) throw new Error(LATEST_DATES_ERROR);
    return [resort.name, date] as const;
  }));
  return new Map(entries.filter((entry) => entry !== null));
}
