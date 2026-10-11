import type { SupabaseClient } from "@supabase/supabase-js";

export type Region = { code: string; name: string; sort_order: number };
export type Resort = {
  id: number;
  name: string;
  display_name: string;
  region_code: string;
  sort_order: number;
  is_active: boolean;
};
export type ResortMaster = { regions: Region[]; resorts: Resort[] };
type MasterClient = Pick<SupabaseClient, "from">;
const resortColumns = "id,name,display_name,region_code,sort_order,is_active";
export const MASTER_ERROR = "エリア・スキー場の情報を取得できませんでした。もう一度お試しください。";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(MASTER_ERROR);
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function parseRegion(value: unknown): Region {
  const row = record(value);
  if (!text(row.code) || !text(row.name) || !positiveInteger(row.sort_order)) throw new Error(MASTER_ERROR);
  return { code: row.code, name: row.name, sort_order: row.sort_order };
}
function parseResort(value: unknown): Resort {
  const row = record(value);
  if (!positiveInteger(row.id) || !text(row.name) || !text(row.display_name)
    || !text(row.region_code) || !positiveInteger(row.sort_order) || typeof row.is_active !== "boolean") {
    throw new Error(MASTER_ERROR);
  }
  return { id: row.id, name: row.name, display_name: row.display_name,
    region_code: row.region_code, sort_order: row.sort_order, is_active: row.is_active };
}

// Share the same public master reads between browser screens and the user-authenticated API.
// No service role, SQL/RPC, or master writes are used.
export async function loadResortMaster(client: MasterClient | null): Promise<ResortMaster> {
  if (!client) throw new Error(MASTER_ERROR);
  const [regionResult, resortResult] = await Promise.all([
    client.from("regions").select("code,name,sort_order").order("sort_order"),
    client.from("resorts").select(resortColumns).order("sort_order").order("id"),
  ]);
  if (regionResult.error || resortResult.error
    || !Array.isArray(regionResult.data) || !Array.isArray(resortResult.data)) throw new Error(MASTER_ERROR);
  const regions = regionResult.data.map(parseRegion);
  const resorts = resortResult.data.map(parseResort);
  const codes = new Set(regions.map((region) => region.code));
  if (!regions.length || !resorts.length || codes.size !== regions.length
    || new Set(resorts.map((resort) => resort.name)).size !== resorts.length
    || resorts.some((resort) => !codes.has(resort.region_code))) throw new Error(MASTER_ERROR);
  return { regions, resorts };
}

export async function findResort(client: MasterClient, name: string): Promise<Resort | null> {
  const { data, error } = await client.from("resorts").select(resortColumns).eq("name", name).maybeSingle();
  if (error) throw new Error(MASTER_ERROR);
  return data === null ? null : parseResort(data);
}

export function regionUrl(code?: string): string {
  return code ? "/?" + new URLSearchParams({ region: code }).toString() : "/";
}
export function postUrl(name?: string, code?: string): string {
  const params = new URLSearchParams();
  if (code) params.set("region", code);
  if (name) params.set("resort", name);
  return "/post" + (params.size ? "?" + params.toString() : "");
}
