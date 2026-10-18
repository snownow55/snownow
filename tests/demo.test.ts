import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDemoCatalog } from "../lib/demo/master.ts";
import { createDemoPosts, DEMO_REGION_CODE, DEMO_DAY, demoListUrl, sortDemoResorts } from "../lib/demo/data.ts";
import { RESORT_READINGS } from "../lib/resort-sort.ts";
import { formatPostDate } from "../lib/post-date.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

test("demo uses all nine reviewed regions and 59 resorts while preserving the original 30 samples", () => {
  const catalog = loadDemoCatalog();
  const expected = readFileSync("docs/resort-master-review/59-resorts-review.csv", "utf8").trim().split(/\r?\n/).slice(1).map((line) => line.split(","));
  assert.equal(catalog.regions.find((region) => region.code === DEMO_REGION_CODE)?.name, "旭川・富良野");
  assert.equal(catalog.regions.length, 9);
  assert.equal(catalog.resorts.length, 59);
  assert.deepEqual(catalog.regions.map((region) => catalog.resorts.filter((r) => r.region_code === region.code).length), [13, 6, 10, 4, 3, 6, 2, 3, 12]);
  assert.deepEqual(catalog.resorts.map((r) => [r.name, r.display_name]), expected.map((row) => row.slice(0, 2)));
  assert.equal(catalog.posts.length, 30);
  assert.deepEqual(createDemoPosts(catalog.resorts), catalog.posts);
  // Snapshot of all 30 samples at the requested baseline commit 0b31637.
  assert.equal(createHash("sha256").update(JSON.stringify(catalog.posts)).digest("hex"), "a2d043c09fdfbafab1be3ffb7f3d2c61f1ff36f94cd38dae66d0ce5426ebdad8");
  for (const resort of catalog.resorts) {
    assert.ok(RESORT_READINGS[resort.name]);
    const posts = catalog.posts.filter((p) => p.resort === resort.name);
    if (resort.region_code !== DEMO_REGION_CODE) { assert.equal(posts.length, 0); continue; }
    assert.equal(posts.length, 3);
    assert.equal(formatPostDate(posts[0].createdAt), "2月14日 09:00");
    assert.equal(formatPostDate(posts[1].createdAt), "2月14日 11:30");
    assert.ok(Date.parse(posts[0].createdAt) < Date.parse(posts[1].createdAt));
    assert.ok(Date.parse(posts[1].createdAt) < Date.parse(posts[2].createdAt));
    for (const post of posts) {
      assert.ok(post.createdAt.startsWith(DEMO_DAY));
      assert.ok(post.area && post.snowType && post.snowfall && post.roughness && post.crowd && post.comment);
      assert.ok(!("id" in post) && !("user_id" in post));
    }
  }
  assert.ok(new Set(catalog.posts.map((p) => p.snowType)).size >= 4);
  assert.ok(new Set(catalog.posts.map((p) => p.crowd)).size === 3);
  assert.ok(new Set(catalog.posts.map((p) => p.createdAt)).size > 3);
});

test("demo generation is reusable while its URLs can only point to the demo list", () => {
  assert.deepEqual(createDemoPosts(loadDemoCatalog().resorts.filter((r) => r.region_code === "sorachi")), []);
  assert.equal(demoListUrl("live", "きろろ", "latest", "sapporo"), "/demo?tab=live&sort=latest&search=%E3%81%8D%E3%82%8D%E3%82%8D&region=sapporo");
  assert.equal(demoListUrl("live", "", "latest", "//evil.test"), "/demo?tab=live&sort=latest");
  assert.equal(demoListUrl("https://evil.test", "<script>&/post", "other"), "/demo?tab=morning&sort=kana&search=%3Cscript%3E%26%2Fpost");
});

test("latest order handles mixed, tied and empty demo resorts without changing samples", () => {
  const catalog = loadDemoCatalog();
  const original = JSON.stringify(catalog);
  const kana = sortDemoResorts(catalog.resorts, catalog.posts, "kana");
  const latest = sortDemoResorts(catalog.resorts, catalog.posts, "latest");
  assert.ok(latest.slice(0, 10).every((resort) => resort.region_code === DEMO_REGION_CODE));
  assert.ok(latest.slice(10).every((resort) => resort.region_code !== DEMO_REGION_CODE));
  assert.deepEqual(latest.slice(10), kana.filter((resort) => resort.region_code !== DEMO_REGION_CODE));
  const timestamps = (name: string) => Math.max(...catalog.posts.filter((p) => p.resort === name).map((p) => Date.parse(p.createdAt)));
  for (let i = 1; i < 10; i++) assert.ok(timestamps(latest[i - 1].name) >= timestamps(latest[i].name));
  for (const timestamp of new Set(catalog.posts.map((post) => Date.parse(post.createdAt)))) {
    const tied = latest.filter((resort) => timestamps(resort.name) === timestamp);
    assert.deepEqual(tied, kana.filter((resort) => tied.some((item) => item.name === resort.name)));
  }
  assert.equal(JSON.stringify(catalog), original);
});
