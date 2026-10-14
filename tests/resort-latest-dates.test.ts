import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadResortLatestDates } from "../lib/resort-latest-dates.ts";

const resort = { id: 1, name: "オーンズ", display_name: "スノークルーズオーンズ", region_code: "sapporo", sort_order: 6, is_active: true };
function client(response: (url: URL) => Response) {
  return createClient("http://127.0.0.1:54321", "sb_publishable_unit_fixture_only", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => response(new URL(String(input))) },
  });
}
const rows = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
test("home sorting fetches only dates, filters before limiting, and preserves precise stored dates", async () => {
  const date = "2026-10-11T00:00:00.000001Z";
  const result = await loadResortLatestDates(client((url) => {
    assert.equal(url.searchParams.get("select"), "created_at");
    assert.equal(url.searchParams.get("limit"), "1");
    assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
    return rows(url.searchParams.get("resort") === "eq.オーンズ" ? [{ created_at: date }] : []);
  }), [resort, { ...resort, id: 2, name: "キロロ" }]);
  assert.deepEqual([...result], [["オーンズ", date]]);
});
test("failed, partial, and malformed date responses cannot produce misleading latest rankings", async () => {
  await assert.rejects(() => loadResortLatestDates(null, [resort]));
  for (const data of [null, {}, [{}], [{ created_at: "invalid" }], [{ created_at: null }], [{ created_at: "2026-10-11T00:00:00Z" }, {}]]) {
    await assert.rejects(() => loadResortLatestDates(client(() => rows(data)), [resort]));
  }
  await assert.rejects(() => loadResortLatestDates(client((url) => url.searchParams.get("resort") === "eq.オーンズ"
    ? rows([{ created_at: "2026-10-11T00:00:00Z" }]) : new Response("{}", { status: 403 })), [resort, { ...resort, name: "キロロ" }]));
});
