import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RESORT_READINGS, sortResorts } from "../lib/resort-sort.ts";
import type { Resort } from "../lib/resort-master.ts";
import { KANA_ORDER } from "./resort-order.fixture.ts";

const resorts: Resort[] = readFileSync("docs/resort-master-review/59-resorts-review.csv", "utf8")
  .trim().split(/\r?\n/).slice(1).map((line, index) => {
    const [name, display_name, region_code, order] = line.split(",");
    return { id: index + 1, name, display_name, region_code, sort_order: Number(order), is_active: true };
  });
test("all 59 canonical names have kana readings and the nine regions follow reviewed kana order", () => {
  assert.equal(resorts.length, 59);
  assert.equal(Object.keys(KANA_ORDER).length, 9);
  assert.deepEqual(Object.keys(RESORT_READINGS).sort(), resorts.map((r) => r.name).sort());
  assert.equal(new Set(Object.values(RESORT_READINGS)).size, 59);
  assert.equal(RESORT_READINGS["大雪山黒岳スキー場"], "たいせつざんくろだけすきーじょう");
  for (const reading of Object.values(RESORT_READINGS)) assert.match(reading, /^[\p{Script=Hiragana}ー]+$/u);
  for (const [region, expected] of Object.entries(KANA_ORDER)) {
    const inRegion = resorts.filter((r) => r.region_code === region);
    assert.deepEqual(sortResorts(inRegion, "kana").map((r) => r.name), expected);
    assert.deepEqual(sortResorts([...inRegion].reverse(), "kana").map((r) => r.name), expected);
  }
});
test("latest sorting puts actual posts first, then breaks equal times and empty resorts by kana", () => {
  const inRegion = resorts.filter((r) => r.region_code === "sapporo");
  const original = structuredClone(inRegion);
  const dates = new Map([["オーンズ", "2026-10-11T10:00:00Z"], ["キロロ", "2026-10-11T09:00:00Z"], ["札幌国際スキー場", "2026-10-11T09:00:00Z"]]);
  const sorted = sortResorts(inRegion, "latest", dates);
  assert.deepEqual(sorted.slice(0, 3).map((r) => r.name), ["オーンズ", "キロロ", "札幌国際スキー場"]);
  assert.deepEqual(sorted.slice(3).map((r) => r.name), KANA_ORDER.sapporo.filter((name) => !dates.has(name)));
  assert.deepEqual(inRegion, original);
  for (const row of sorted) assert.equal(row, inRegion.find((r) => r.name === row.name));
  assert.deepEqual(sortResorts(inRegion, "latest").map((r) => r.name), KANA_ORDER.sapporo);
});
test("latest order respects timestamp timezones and PostgreSQL microsecond precision", () => {
  const pair = resorts.filter((r) => ["オーンズ", "キロロ"].includes(r.name));
  assert.deepEqual(sortResorts(pair, "latest", new Map([
    ["オーンズ", "2026-10-11T09:00:00.000002+09:00"], ["キロロ", "2026-10-11T00:00:00.000001Z"],
  ])).map((r) => r.name), ["オーンズ", "キロロ"]);
  assert.deepEqual(sortResorts(pair, "latest", new Map([
    ["オーンズ", "2026-10-11T09:00:00+09:00"], ["キロロ", "2026-10-11T00:00:00Z"],
  ])).map((r) => r.name), ["キロロ", "オーンズ"]);
});
