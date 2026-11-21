import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  collectOfficialConditions, createCollectionStore, parseSourceApprovals,
  type CollectorSource, type CollectionStore,
} from "../lib/official-collector.ts";

const url = "https://fixture.invalid/snow";
const approvals = parseSourceApprovals(JSON.stringify({ "1": url }));
const now = () => new Date("2026-11-21T01:00:00Z");
const source: CollectorSource = {
  id: 1, resort_id: 10, source_url: url, adapter_key: "json-v1", enabled: true,
  access_permission: "allowed", publication_permission: "allowed",
};
const feed = {
  status: "success", observation_date: "2026-11-21", observed_at: "2026-11-21T07:00:00+09:00",
  published_at: "2026-11-21T08:30:00+09:00", location_kind: "summit", location_name: "山頂",
  new_snow: { value: 135, unit: "mm" }, snow_depth: { value: 1.25, unit: "m" },
  temperature: { value: 23, unit: "F" }, snowfall_period: "昨晩から", snow_quality: "圧雪",
};

type Observation = Parameters<CollectionStore["store"]>[1];
function repository(override: Partial<CollectorSource> = {}) {
  const writes: Observation[] = [];
  const db: CollectionStore = {
    loadSource: async () => ({ ...source, ...override }),
    async store(_source, observation) {
      writes.push(observation);
      return "saved";
    },
  };
  return { db, writes };
}

async function runFeed(value: unknown) {
  const { db, writes } = repository();
  const result = await collectOfficialConditions(approvals, db, { request: async () => Response.json(value), now });
  assert.equal(writes.length, 1);
  return { result, row: writes[0] };
}

test("approved feed is requested exactly and stored using service RPCs with normalized units and timestamps", async () => {
  const databaseCalls: { name: string; params: Record<string, unknown> }[] = [];
  const database = createClient("http://127.0.0.1:55121", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const name = new URL(String(input)).pathname.split("/").at(-1) ?? "";
        databaseCalls.push({ name, params: JSON.parse(String(init?.body)) });
        return Response.json(name === "get_official_collection_source" ? source : "saved");
      },
    },
  });
  const result = await collectOfficialConditions(approvals, createCollectionStore(database), {
    now,
    request: async (input, init) => {
      assert.equal(input, url);
      assert.equal(init?.redirect, "error");
      assert.equal(init?.signal?.aborted, false);
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      return Response.json(feed);
    },
  });
  assert.deepEqual(result, [{ id: 1, result: "saved" }]);
  assert.deepEqual(databaseCalls.map(c => c.name), ["get_official_collection_source", "store_official_observation"]);
  const params = databaseCalls[1].params;
  assert.equal(params.p_adapter_key, "json-v1");
  assert.equal(params.p_source_url, url);
  const row = params.p_observation as Observation;
  assert.deepEqual([row.new_snow_cm, row.snow_depth_cm, row.temperature_c], [13.5, 125, -5]);
  assert.equal(row.observed_at, "2026-11-20T22:00:00.000Z");
  assert.equal(row.published_at, "2026-11-20T23:30:00.000Z");
  assert.equal(row.fetched_at, now().toISOString());
  assert.equal(row.source_url, url);
  assert.equal(row.snowfall_period, "昨晩から");
});

test("disabled, unapproved, revoked, changed and unsupported sources make no HTTP request", async () => {
  const cases: Partial<CollectorSource>[] = [
    { enabled: false }, { access_permission: "unconfirmed" }, { access_permission: "denied" },
    { publication_permission: "unconfirmed" }, { publication_permission: "denied" },
    { source_url: "https://changed.invalid/snow" }, { adapter_key: "unknown" }, { id: 2 },
  ];
  for (const change of cases) {
    const { db, writes } = repository(change);
    const request = async () => { assert.fail("unexpected HTTP call"); };
    assert.deepEqual(await collectOfficialConditions(approvals, db, { request, now }), [{ id: 1, result: "skipped" }]);
    assert.deepEqual(writes, []);
  }
  for (const input of ["{}", "[]", '{"1":"http://fixture.invalid/snow"}', '{"1":"https://user@fixture.invalid/snow"}', '{"0":"https://fixture.invalid/snow"}']) {
    assert.throws(() => parseSourceApprovals(input));
  }
});

test("depth never becomes fresh snow; zero is retained only when explicit, and period labels remain eligible", async () => {
  const partial = await runFeed({ ...feed, new_snow: null, temperature: null });
  assert.equal(partial.row.new_snow_cm, null);
  assert.equal(partial.row.snow_depth_cm, 125);
  assert.equal(partial.row.temperature_c, null);
  const last24Hours = await runFeed({ ...feed, new_snow: null, snowfall_24h: { value: 8, unit: "cm" } });
  assert.equal(last24Hours.row.new_snow_cm, 8);
  assert.equal(last24Hours.row.snowfall_period, "24時間");
  const preferred = await runFeed({ ...feed, snowfall_24h: { value: 8, unit: "cm" } });
  assert.equal(preferred.row.new_snow_cm, 13.5);
  assert.equal(preferred.row.snowfall_period, "昨晩から");
  for (const period of ["昨晩から", "昨日から", "営業終了後から", "24時間"]) {
    const { row } = await runFeed({ ...feed, new_snow: { value: 0, unit: "cm" }, snowfall_period: period });
    assert.equal(row.new_snow_cm, 0);
    assert.equal(row.snowfall_period, period);
  }
  const empty = await runFeed({ status: "success", observation_date: feed.observation_date });
  assert.equal(empty.row.status, "missing");
  assert.equal(empty.row.new_snow_cm, null);
});

test("invalid values fail safely; stale, missing and closed readings contain no values", async () => {
  for (const change of [
    { new_snow: { value: -1, unit: "cm" } }, { temperature: { value: 1000, unit: "C" } },
    { snow_depth: { value: "125", unit: "cm" } }, { new_snow: { value: 12, unit: "kg" } },
    { observation_date: "2026-02-30" }, { published_at: "2026-11-22T00:00:00Z" },
  ]) {
    const { row, result } = await runFeed({ ...feed, ...change });
    assert.deepEqual(result, [{ id: 1, result: "saved", failure: "invalid_response" }]);
    assert.equal(row.status, "failed");
    assert.equal(row.new_snow_cm, null);
    assert.equal(row.snow_depth_cm, null);
  }
  const { row } = await runFeed({
    ...feed, observation_date: "2026-11-20", observed_at: "2026-11-20T08:00:00+09:00",
    published_at: "2026-11-20T09:00:00+09:00",
  });
  assert.equal(row.status, "stale");
  assert.equal(row.new_snow_cm, null);
  for (const status of ["missing", "closed"]) assert.equal((await runFeed({ ...feed, status })).row.new_snow_cm, null);
});

test("timeouts, HTTP errors and malformed bodies are stored as failures without data", async () => {
  const requests: [typeof fetch, string][] = [
    [async (_, init) => {
      await new Promise<void>(resolve => { init?.signal?.addEventListener("abort", () => resolve(), { once: true }); });
      throw new Error("aborted fixture");
    }, "timeout"],
    [async () => new Response("unavailable", { status: 503 }), "http"],
    [async () => { throw new Error("local mock failure"); }, "network"],
    [async () => new Response("invalid-json", { headers: { "content-type": "application/json" } }), "invalid_response"],
    [async () => new Response("x".repeat(262145), { headers: { "content-type": "application/json" } }), "invalid_response"],
  ];
  // AbortSignal.timeout uses an unref'd timer, so keep the test loop active.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    for (const [request, failure] of requests) {
      const { db, writes } = repository();
      const result = await collectOfficialConditions(approvals, db, { request, now, timeoutMs: 10 });
      assert.deepEqual(result, [{ id: 1, result: "saved", failure }]);
      assert.equal(writes[0].status, "failed");
      assert.equal(writes[0].new_snow_cm, null);
    }
  } finally {
    clearTimeout(keepAlive);
  }
});

test("worker distinguishes duplicate and superseded writes and revocation during retrieval", async () => {
  for (const result of ["duplicate", "superseded", "permission_changed"] as const) {
    const { db } = repository();
    db.store = async () => result;
    assert.deepEqual(await collectOfficialConditions(approvals, db, {
      request: async () => Response.json(feed), now,
    }), [{ id: 1, result }]);
  }
});
