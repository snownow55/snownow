import test from "node:test";
import assert from "node:assert/strict";
import {
  runProductionPreflight, validateProductionConfiguration,
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
    id: 2, resort_id: 0, resort_name: "別施設", source_url: "https://fixture.invalid/",
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
