import type { SupabaseClient } from "@supabase/supabase-js";

export type OfficialStatus = "success" | "missing" | "failed" | "closed" | "stale";
export type OfficialCondition = {
  resort_id: number; status: OfficialStatus; observation_date: string | null;
  observed_at: string | null; published_at: string | null; fetched_at: string | null;
  location_kind: "summit" | "base" | "unspecified" | null; location_name: string | null;
  source_url: string; snowfall_period: string | null;
  new_snow_cm: number | null; snow_depth_cm: number | null; temperature_c: number | null;
  official_snow_quality: string | null;
};

export function japanDate(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function isCurrentOfficial(row: OfficialCondition, now = new Date()): boolean {
  return row.status === "success" && row.observation_date === japanDate(now)
    && !!row.fetched_at && Number.isFinite(Date.parse(row.fetched_at))
    && Date.parse(row.fetched_at) <= now.getTime()
    && japanDate(new Date(row.fetched_at)) === row.observation_date
    && [row.observed_at, row.published_at].every((time) => time === null
      || (Number.isFinite(Date.parse(time)) && japanDate(new Date(time)) === row.observation_date
        && Date.parse(time) <= now.getTime()));
}
export function officialStatusLabel(row?: OfficialCondition, now = new Date()): string {
  if (!row) return "未取得";
  if (row.status === "success") return isCurrentOfficial(row, now) ? "" : "朝の情報は未掲載";
  return row.status === "missing" ? "未発表" : row.status === "closed" ? "休場" : "朝の情報は未掲載";
}
const columns = "resort_id,status,observation_date,observed_at,published_at,fetched_at,location_kind,location_name,source_url,snowfall_period,new_snow_cm,snow_depth_cm,temperature_c,official_snow_quality";
export async function loadOfficialConditions(client: Pick<SupabaseClient, "from"> | null): Promise<OfficialCondition[]> {
  if (!client) throw new Error("公式情報を取得できませんでした。");
  const { data, error } = await client.from("official_morning_conditions").select(columns);
  if (error || !Array.isArray(data)) throw new Error("公式情報を取得できませんでした。");
  for (const row of data) {
    if (!Number.isSafeInteger(row.resort_id) || row.resort_id <= 0
      || !["success", "missing", "failed", "closed", "stale"].includes(row.status)
      || typeof row.source_url !== "string" || !/^https:\/\//.test(row.source_url)
      || (["new_snow_cm", "snow_depth_cm", "temperature_c"] as const).some((key) => row[key] !== null
        && (typeof row[key] !== "number" || !Number.isFinite(row[key])))
      || (["new_snow_cm", "snow_depth_cm"] as const).some((key) => row[key] !== null && row[key] < 0)
      || (["observation_date", "observed_at", "published_at", "fetched_at", "location_name", "official_snow_quality", "snowfall_period"] as const)
        .some((key) => row[key] !== null && typeof row[key] !== "string")) {
      throw new Error("公式情報の形式を確認できませんでした。");
    }
  }
  return data as OfficialCondition[];
}

export type OfficialSource = {
  id: number; resort_id: number; source_url: string; enabled: boolean;
  access_permission: "unconfirmed" | "allowed" | "denied";
  publication_permission: "unconfirmed" | "allowed" | "denied";
  permission_scope: string;
};
export type OfficialObservationInput = Omit<OfficialCondition, "resort_id"> & {
  source_id: number; resort_id: number; observation_date: string;
  location_kind: "summit" | "base" | "unspecified"; location_name: string;
};
export function mayFetchOfficialSource(source: Pick<OfficialSource, "enabled" | "access_permission">): boolean {
  return source.enabled && source.access_permission === "allowed";
}

export function mayPublishOfficialSource(source: Pick<OfficialSource, "enabled" | "publication_permission">): boolean {
  return source.enabled && source.publication_permission === "allowed";
}
