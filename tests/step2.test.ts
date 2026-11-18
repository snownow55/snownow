import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { choices, validPost, transitionalPost } from "../lib/post-validation.ts";
import { postingStatus, remainingPostTime } from "../lib/posting-limit.ts";
import { readLocalPosts, createLocalPost, toPostInput } from "../lib/demo/local-posts.ts";
import { loadDemoCatalog } from "../lib/demo/master.ts";
import master from "../data/resort-master.json" with { type: "json" };

const catalog = loadDemoCatalog();
const input = toPostInput(catalog.posts[0]);
test("new contract removes ratings/wet snow, preserves legacy wet posts, and expires compatibility", () => {
  assert.equal(choices.snow_type.includes("湿雪"), false);
  assert.ok(choices.snow_type.includes("シャバ雪・べちゃ雪"));
  assert.equal(validPost(input), true);
  assert.equal(validPost({ ...input, condition: null }), false);
  assert.equal(validPost({ ...input, snow_type: "湿雪" }), false);
  const legacy = { ...catalog.posts[0], localId: "legacy-wet", snowType: "湿雪" };
  assert.deepEqual(readLocalPosts(JSON.stringify({ version: 1, posts: [legacy] }), catalog.resorts), [legacy]);
  assert.throws(() => createLocalPost(toPostInput(legacy), catalog.resorts, "new", legacy.createdAt));
  const old = { ...input, condition: null };
  assert.deepEqual(transitionalPost(old, "2026-11-16T00:00:00Z", Date.parse("2026-11-15T00:00:00Z")), input);
  assert.equal(validPost(transitionalPost(old, "2026-11-16T00:00:00Z", Date.parse("2026-11-16T00:00:00Z"))), false);
  assert.equal(validPost(transitionalPost(old, undefined)), false);
  assert.equal(validPost(transitionalPost({ ...input, condition: "★★★★★" }, "2099-01-01")), false);
});
test("63 active masters retain Northern Arc's internal name and the approved regions", () => {
  assert.equal(master.resorts.length, 63);
  assert.equal(new Set(master.resorts.map((r) => r.name.normalize("NFKC"))).size, 63);
  assert.deepEqual(master.regions.map((g) => master.resorts.filter((r) => r.region_code === g.code).length), [14,6,11,5,4,6,2,4,11]);
  assert.ok(!master.resorts.some((r) => r.name === "士別あさひスキー場"));
  assert.equal(master.resorts.find((r) => r.name === "メムロスキー場")?.region_code,"doo");
  assert.equal(master.resorts.find((r) => r.name === "ノーザンアークリゾート")?.display_name,"ノーザンアークリゾートスキー場");
  assert.equal(master.resorts.find((r) => r.name === "暑寒別岳スキー場")?.region_code,"asahikawa-furano");
  // Historical demo master remains intact; the DB seed embeds the approved live master.
  for (const r of master.resorts) assert.ok(readFileSync("supabase/migrations/20261115000100_beta_foundation.sql","utf8").includes(r.name.replaceAll("'","''")));
});
test("server posting windows are validated and countdown rounds safely", () => {
  const status = { allowed: false, retryAfterSeconds: 3600, serverTime: "2026-11-15T00:00:00Z", nextAllowedAt: "2026-11-15T01:00:00Z" };
  assert.deepEqual(postingStatus(status),status);
  for (const bad of [null,{}, { ...status,retryAfterSeconds:-1 }, { ...status,nextAllowedAt:null }, { ...status,serverTime:"bad" }]) assert.equal(postingStatus(bad),null);
  assert.equal(remainingPostTime(3600),"60分0秒");
  assert.equal(remainingPostTime(59.1),"1分0秒");
  assert.equal(remainingPostTime(0),"0分0秒");
});
