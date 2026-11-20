import { test } from "node:test";
import assert from "node:assert/strict";
import { isCurrentOfficial, japanDate, officialStatusLabel, mayFetchOfficialSource, loadOfficialConditions, type OfficialCondition } from "../lib/official-conditions.ts";
const now = new Date("2026-11-20T00:00:00Z");
const row: OfficialCondition = {
  resort_id: 1, status: "success", observation_date: "2026-11-20",
  observed_at: "2026-11-19T22:00:00Z", published_at: null, fetched_at: "2026-11-19T23:00:00Z",
  location_kind: "summit", location_name: "山頂", source_url: "https://example.test/snow",
  snowfall_period: "24時間", new_snow_cm: 0, snow_depth_cm: null, temperature_c: -5,
  official_snow_quality: null,
};
test("JST midnight expires today's values; previous seasons and future readings are never current", () => {
  assert.equal(japanDate(new Date("2026-11-19T15:00:00Z")), "2026-11-20");
  assert.equal(isCurrentOfficial(row, now), true);
  assert.equal(isCurrentOfficial(row, new Date("2026-11-20T14:59:59.999Z")), true);
  assert.equal(isCurrentOfficial(row, new Date("2026-11-20T15:00:00Z")), false);
  for (const change of [{ observation_date: "2025-11-20" }, { fetched_at: "2025-11-20T00:00:00Z" },
    { published_at: "2026-11-21T00:00:00Z" }, { observed_at: "not-a-date" }]) {
    assert.equal(isCurrentOfficial({ ...row, ...change }, now), false);
  }
});
test("zero, unknown and official quality remain distinct; states never imply zero", () => {
  assert.equal(row.new_snow_cm, 0); assert.equal(row.snow_depth_cm, null);
  assert.equal(officialStatusLabel(undefined, now), "未取得");
  assert.equal(officialStatusLabel({ ...row, status: "missing" }, now), "未発表");
  assert.equal(officialStatusLabel({ ...row, status: "closed" }, now), "休場");
  for (const status of ["failed", "stale"] as const) {
    assert.equal(officialStatusLabel({ ...row, status }, now), "朝の情報は未掲載");
    assert.equal(isCurrentOfficial({ ...row, status }, now), false);
  }
});
test("unconfirmed, denied and disabled sources cannot be fetched", () => {
  const source = { id: 1, resort_id: 1, source_url: row.source_url, enabled: true,
    access_permission: "allowed" as const, publication_permission: "allowed" as const, permission_scope: "test" };
  assert.equal(mayFetchOfficialSource(source), true);
  assert.equal(mayFetchOfficialSource({ ...source, enabled: false }), false);
  assert.equal(mayFetchOfficialSource({ ...source, access_permission: "unconfirmed" }), false);
  assert.equal(mayFetchOfficialSource({ ...source, access_permission: "denied" }), false);
});
test("public reader preserves partial values and rejects query failures or malformed values", async () => {
  const mock = (data: unknown, error: unknown = null) => ({ from: (name: string) => {
    assert.equal(name, "official_morning_conditions"); return { select: async () => ({ data, error }) };
  } }) as unknown as NonNullable<Parameters<typeof loadOfficialConditions>[0]>;
  assert.deepEqual(await loadOfficialConditions(mock([row])), [row]);
  await assert.rejects(loadOfficialConditions(mock([], { message: "missing view" })));
  await assert.rejects(loadOfficialConditions(mock([{ ...row, new_snow_cm: "0" }])));
  await assert.rejects(loadOfficialConditions(mock([{ ...row, source_url: "javascript:alert(1)" }])));
});
