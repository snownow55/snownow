import test from "node:test";
import assert from "node:assert/strict";
import { collectOfficialConditions, type CollectionStore } from "../lib/official-collector.ts";
import {
  runProductionPreflight, validateProductionConfiguration, collectionLogSummary,
  validateKokusaiSource, validateSingleCollectionResult,
} from "../scripts/official-production-preflight.ts";

const env = {
  OFFICIAL_SUPABASE_URL: "https://rtgqyctqjfoercdymssd.supabase.co",
  OFFICIAL_APPROVED_SOURCES: '{"1":"https://www.sapporo-kokusai.jp/"}',
  OFFICIAL_SUPABASE_SERVICE_KEY: "synthetic-unit-test-credential",
};
const source = {
  id: 1, resort_id: 11, resort_name: "札幌国際スキー場",
  source_url: "https://www.sapporo-kokusai.jp/", adapter_key: "sapporo-kokusai-html",
  enabled: true, access_permission: "allowed", publication_permission: "allowed",
};

test("preflight rejects another project before making a database request", async () => {
  let reads = 0;
  await assert.rejects(runProductionPreflight({ ...env,
    OFFICIAL_SUPABASE_URL: "https://viidjrhaoxcvunbfdbni.supabase.co",
  }, async () => { reads++; return source; }), /PRODUCTION_PROJECT_MISMATCH/);
  assert.equal(reads, 0);
  for (const url of [env.OFFICIAL_SUPABASE_URL + "?x=1", env.OFFICIAL_SUPABASE_URL + "/rest/v1",
    "http://rtgqyctqjfoercdymssd.supabase.co", "https://rtgqyctqjfoercdymssd.supabase.co.evil.invalid"]) {
    assert.throws(() => validateProductionConfiguration({ ...env, OFFICIAL_SUPABASE_URL: url }));
  }
});

test("only source 1 and its exact HTTPS URL can be approved", () => {
  for (const approvals of ["", "null", "[]", "{}", '{"2":"https://www.sapporo-kokusai.jp/"}',
    '{"1":"https://www.sapporo-kokusai.jp/","2":"https://fixture.invalid/"}',
    '{"1":"https://www.sapporo-kokusai.jp/other"}']) {
    assert.throws(() => validateProductionConfiguration({ ...env, OFFICIAL_APPROVED_SOURCES: approvals }));
  }
  assert.throws(() => validateProductionConfiguration({ ...env, OFFICIAL_SUPABASE_SERVICE_KEY: "" }));
});

test("database identity, URL, adapter and both operational gates must match", () => {
  for (const [key, value] of Object.entries({
    id: 2, resort_id: 12, resort_name: "別施設", source_url: "https://fixture.invalid/",
    adapter_key: "json-v1", enabled: false, access_permission: "unconfirmed",
    publication_permission: "denied",
  })) {
    assert.throws(() => validateKokusaiSource({ ...source, [key]: value }), /PRODUCTION_SOURCE_MISMATCH/);
  }
  assert.throws(() => validateKokusaiSource(null));
});

test("valid configuration is read once without treating notice as individual consent", async () => {
  let reads = 0;
  await runProductionPreflight(env, async () => { reads++; return {
    ...source, permission_scope: JSON.stringify({ individual_consent: "unconfirmed" }),
  }; });
  assert.equal(reads, 1);
});

test("a skipped or rejected write is never reported as a successful collection", () => {
  for (const result of ["skipped", "permission_changed", "superseded", "database_error"]) {
    assert.throws(() => validateSingleCollectionResult([{ id: 1, result }]));
  }
  for (const invalid of [[], [{ id: 2, result: "saved" }],
    [{ id: 1, result: "saved", failure: "http" }],
    [{ id: 1, result: "saved" }, { id: 2, result: "saved" }]]) {
    assert.throws(() => validateSingleCollectionResult(invalid));
  }
  validateSingleCollectionResult([{ id: 1, result: "saved" }]);
  validateSingleCollectionResult([{ id: 1, result: "duplicate" }]);
});

test("collection failure logs preserve known reasons without exposing arbitrary data", () => {
  for (const failure of ["timeout", "network", "http", "invalid_response"]) {
    assert.deepEqual(collectionLogSummary([{ id: 1, result: "saved", failure,
      headers: { authorization: "synthetic-secret-must-not-be-logged" }, rawBody: "private payload",
    }]), [{ id: 1, result: "saved", failure }]);
  }
  assert.deepEqual(collectionLogSummary([{ id: 1, result: "database_error" }]),
    [{ id: 1, result: "database_error" }]);
  assert.deepEqual(collectionLogSummary([{ id: 1, result: "synthetic-secret", failure: "synthetic-secret" }]),
    [{ id: 1, result: "invalid_result", failure: "unrecognized_failure" }]);
  assert.deepEqual(collectionLogSummary([{ id: 2, result: "saved" }]),
    [{ id: 1, result: "invalid_result" }]);
  assert.deepEqual(collectionLogSummary(null), [{ id: 1, result: "invalid_result" }]);
});

test("all three JST morning windows keep yesterday stale and distinguish current zero from missing", async () => {
  const html = (stamp: string, snow: string) => '<section id="toprealtime"><p>' + stamp + '</p>'
    + `<div>${snow}</div><div>SNOWFALL</div><div>昨晩からの降雪</div>`
    + '<div>70cm</div><div>SNOW ACCUMULATION</div><div>山頂積雪</div>'
    + '<div>-4℃</div><div>TEMPERATURE</div><div>気温</div>'
    + '<div>－</div><div>SNOW CONDITIONS</div><div>雪質</div></section>';
  for (const at of ["2026-11-22T22:12:00Z", "2026-11-22T23:18:00Z", "2026-11-23T00:12:00Z"]) {
    for (const previousDay of [true, false]) {
      const writes: Parameters<CollectionStore["store"]>[1][] = [];
      await collectOfficialConditions([{ id: 1, url: source.source_url }], {
        loadSource: async () => ({ ...source, access_permission: "allowed", publication_permission: "allowed" }),
        store: async (_, row) => { writes.push(row); return "saved"; },
      }, {
        now: () => new Date(at),
        request: async () => new Response(html(previousDay ? "2026年11月22日14時 現在" : "2026年11月23日07時 現在", "0cm"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      });
      assert.equal(writes.length, 1);
      const row = writes[0];
      assert.equal(row.status, previousDay ? "stale" : "success");
      assert.equal(row.observation_date, previousDay ? "2026-11-22" : "2026-11-23");
      assert.equal(row.new_snow_cm, previousDay ? null : 0);
      assert.equal(row.snow_depth_cm, previousDay ? null : 70);
      assert.equal(row.temperature_c, previousDay ? null : -4);
      assert.equal(row.official_snow_quality, null);
      assert.equal(row.observed_at, null);
      assert.equal(row.fetched_at, new Date(at).toISOString());
      assert.equal(row.published_at, previousDay ? "2026-11-22T05:00:00.000Z" : "2026-11-22T22:00:00.000Z");
    }
  }
});
