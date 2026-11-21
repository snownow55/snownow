import type { SupabaseClient } from "@supabase/supabase-js";
import type { Region } from "./resort-master";

type PreferenceClient = Pick<SupabaseClient, "from">;
export const REGION_PREFERENCES_ERROR = "登録エリアを取得できませんでした。";
export const REGION_SAVE_ERROR = "登録エリアを保存できませんでした。もう一度お試しください。";

// Canonical master order, not selection order. Ignore removed/unknown region codes.
export function normalizeRegionCodes(value: unknown, regions: readonly Region[]): string[] {
  const codes = new Set(Array.isArray(value) ? value.filter((code) => typeof code === "string") : []);
  return [...regions].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
    .filter((region) => codes.has(region.code)).map((region) => region.code);
}

export function prioritizeRegions(regions: readonly Region[], preferred: readonly string[]): Region[] {
  const codes = new Set(preferred);
  return [...regions].sort((a, b) => Number(codes.has(b.code)) - Number(codes.has(a.code))
    || a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}

export async function loadRegionPreferences(client: PreferenceClient, userId: string): Promise<string[]> {
  const { data, error } = await client.from("user_region_preferences").select("region_codes")
    .eq("user_id", userId).maybeSingle();
  if (error || (data !== null && (!Array.isArray(data.region_codes)
    || !data.region_codes.every((code: unknown) => typeof code === "string")))) {
    throw new Error(REGION_PREFERENCES_ERROR);
  }
  return data?.region_codes ?? [];
}

export async function saveRegionPreferences(client: PreferenceClient, userId: string, codes: string[]) {
  // One atomic upsert; an empty array clears preferences without a delete/insert gap.
  const { data, error } = await client.from("user_region_preferences")
    .upsert({ user_id: userId, region_codes: codes }, { onConflict: "user_id" })
    .select("region_codes").single();
  if (error || !data || !Array.isArray(data.region_codes)
    || JSON.stringify(data.region_codes) !== JSON.stringify(codes)) throw new Error(REGION_SAVE_ERROR);
}
