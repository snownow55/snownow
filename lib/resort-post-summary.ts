import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resort } from "./resort-master";

export type LatestSnowPost = {
  id: number;
  resort: string;
  area: string;
  snow_type: string;
  snowfall: string;
  roughness: string;
  crowd: string;
  comment: string;
  created_at: string;
};
export type ResortPostSummary = { latest: LatestSnowPost | null; count: number };
export const POSTS_ERROR = "投稿情報を取得できませんでした。";
const columns = "id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at";

function parsePost(value: unknown, name: string): LatestSnowPost {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(POSTS_ERROR);
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.id) || (row.id as number) <= 0 || row.resort !== name
    || ["area", "snow_type", "snowfall", "roughness", "crowd", "comment", "created_at"].some((key) => typeof row[key] !== "string")
    || !Number.isFinite(Date.parse(row.created_at as string))) throw new Error(POSTS_ERROR);
  return row as LatestSnowPost;
}

// Read only the selected region's resorts. A global post limit must never hide a
// resort's latest post; exact counts also preserve the existing card count.
export async function loadResortPostSummaries(
  client: Pick<SupabaseClient, "from"> | null,
  resorts: readonly Resort[],
  signal?: AbortSignal,
): Promise<Map<string, ResortPostSummary>> {
  if (!client) throw new Error(POSTS_ERROR);
  const entries = await Promise.all(resorts.map(async (resort) => {
    let query = client.from("snow_posts").select(columns, { count: "exact" })
      .eq("resort", resort.name).order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(1);
    if (signal) query = query.abortSignal(signal);
    const { data, error, count } = await query;
    if (error || !Array.isArray(data) || data.length > 1 || count === null
      || !Number.isSafeInteger(count) || count < 0 || (count === 0) !== (data.length === 0)) {
      throw new Error(POSTS_ERROR);
    }
    return [resort.name, { latest: data.length ? parsePost(data[0], resort.name) : null, count }] as const;
  }));
  return new Map(entries);
}
