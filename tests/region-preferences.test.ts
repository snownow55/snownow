import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRegionCodes, prioritizeRegions, loadRegionPreferences, saveRegionPreferences } from "../lib/region-preferences.ts";
const regions = [
  { code: "a", name: "地域A", sort_order: 1 },
  { code: "b", name: "地域B", sort_order: 2 },
  { code: "c", name: "地域C", sort_order: 3 },
];
test("multiple preferences preserve master order, retain unregistered areas and never mutate the master", () => {
  const before = structuredClone(regions);
  assert.deepEqual(prioritizeRegions(regions, ["c", "b"]).map((r) => r.code), ["b", "c", "a"]);
  assert.deepEqual(prioritizeRegions(regions, []).map((r) => r.code), ["a", "b", "c"]);
  assert.deepEqual(regions, before);
});
test("stored stale, duplicate and invalid region values cannot add or hide master areas", () => {
  assert.deepEqual(normalizeRegionCodes(["c", "bad", "a", "a", null, 4], regions), ["a", "c"]);
  assert.deepEqual(normalizeRegionCodes(null, regions), []);
  assert.deepEqual(prioritizeRegions(regions, ["bad"]).map((r) => r.code), ["a", "b", "c"]);
});
function client(data: unknown, error: unknown = null) {
  const calls: unknown[] = [];
  const query = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return query; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return query; },
    upsert: (...args: unknown[]) => { calls.push(["upsert", ...args]); return query; },
    maybeSingle: async () => ({ data, error }), single: async () => ({ data, error }),
  };
  return { calls, api: { from: (name: string) => { calls.push(["from", name]); return query; } } as unknown as Pick<SupabaseClient, "from"> };
}
test("account reads are scoped; missing registration is empty; service failure remains an error", async () => {
  const mock = client({ region_codes: ["b", "c"] });
  assert.deepEqual(await loadRegionPreferences(mock.api, "alice"), ["b", "c"]);
  assert.ok(mock.calls.some((call) => JSON.stringify(call) === '["eq","user_id","alice"]'));
  assert.deepEqual(await loadRegionPreferences(client(null).api, "bob"), []);
  await assert.rejects(loadRegionPreferences(client(null, { message: "not migrated" }).api, "alice"));
  await assert.rejects(loadRegionPreferences(client({ region_codes: [null] }).api, "alice"));
});
test("save atomically replaces only the current user's preferences, including clearing; failed/empty writes never report success", async () => {
  const mock = client({ region_codes: [] });
  await saveRegionPreferences(mock.api, "alice", []);
  assert.deepEqual(mock.calls[1], ["upsert", { user_id: "alice", region_codes: [] }, { onConflict: "user_id" }]);
  await assert.rejects(saveRegionPreferences(client(null).api, "alice", []));
  await assert.rejects(saveRegionPreferences(client({ region_codes: [] }, { message: "denied" }).api, "alice", []));
});
