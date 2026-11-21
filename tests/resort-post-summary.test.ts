import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadResortPostSummaries } from "../lib/resort-post-summary.ts";

const resort = { id: 1, name: "オーンズ", display_name: "スノークルーズオーンズ", region_code: "sapporo", sort_order: 6, is_active: true };
const latest = { id: 1201, resort: resort.name, area: "中腹", snow_type: "パウダー", snowfall: "ほぼ無し", roughness: "きれい", crowd: "空いている", comment: "最新の現地コメント", created_at: "2026-10-11T00:00:00.000001Z" };
function client(response: (url: URL, init?: RequestInit) => Response) {
  return createClient("http://127.0.0.1:54321", "sb_publishable_unit_fixture_only", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => response(new URL(String(input)), init) },
  });
}
function rows(data: unknown, count?: number, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json", ...(count === undefined ? {} : { "Content-Range": `0-0/${count}` }),
  } });
}
test("latest reads filter canonical resorts before limit and keep exact counts beyond 1000", async () => {
  const calls: string[] = [];
  const summaries = await loadResortPostSummaries(client((url, init) => {
    calls.push(url.searchParams.get("resort")!);
    assert.equal(init?.method, "GET");
    assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
    assert.equal(url.searchParams.get("limit"), "1");
    assert.match(new Headers(init?.headers).get("prefer")!, /count=exact/);
    assert.equal(url.searchParams.get("select")!.includes("condition"), false);
    return url.searchParams.get("resort") === "eq.オーンズ" ? rows([latest], 1201) : rows([], 0);
  }), [resort, { ...resort, id: 2, name: "キロロ" }]);
  assert.deepEqual(calls, ["eq.オーンズ", "eq.キロロ"]);
  assert.deepEqual(summaries.get("オーンズ"), { latest, count: 1201 });
  assert.deepEqual(summaries.get("キロロ"), { latest: null, count: 0 });
});
test("partial, malformed, inconsistent, and failed post reads never return empty summaries", async () => {
  await assert.rejects(() => loadResortPostSummaries(null, [resort]));
  for (const response of [
    rows(null, 0), rows([], 1), rows([latest], 0), rows([latest]), rows([latest, latest], 2),
    rows([{ ...latest, resort: "キロロ" }], 1), rows([{ ...latest, created_at: "invalid" }], 1),
    rows([{ ...latest, comment: null }], 1), rows({ message: "read failed" }, undefined, 500),
  ]) await assert.rejects(() => loadResortPostSummaries(client(() => response), [resort]));
  await assert.rejects(() => loadResortPostSummaries(client((url) => url.searchParams.get("resort") === "eq.オーンズ"
    ? rows([latest], 1) : rows({ message: "read failed" }, undefined, 403)), [resort, { ...resort, id: 2, name: "キロロ" }]));
});
