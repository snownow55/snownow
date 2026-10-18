import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDemoCatalog } from "../lib/demo/master.ts";
import { createDemoPosts, DEMO_DAY, demoListUrl } from "../lib/demo/data.ts";
import { RESORT_READINGS } from "../lib/resort-sort.ts";
import { formatPostDate } from "../lib/post-date.ts";
import { readFileSync } from "node:fs";

test("demo uses every resort in the reviewed target master and exactly three deterministic posts each", () => {
  const catalog = loadDemoCatalog();
  const expected = readFileSync("docs/resort-master-review/59-resorts-review.csv", "utf8").trim().split(/\r?\n/).slice(1).map((line) => line.split(",")).filter((row) => row[2] === catalog.region.code);
  assert.equal(catalog.region.name, "旭川・富良野");
  assert.equal(catalog.resorts.length, 10);
  assert.deepEqual(catalog.resorts.map((r) => [r.name, r.display_name]), expected.map((row) => row.slice(0, 2)));
  assert.equal(catalog.posts.length, 30);
  assert.deepEqual(createDemoPosts(catalog.resorts), catalog.posts);
  for (const resort of catalog.resorts) {
    assert.ok(RESORT_READINGS[resort.name]);
    const posts = catalog.posts.filter((p) => p.resort === resort.name);
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
  assert.equal(loadDemoCatalog("sorachi").resorts.length, 6);
  assert.throws(() => loadDemoCatalog("unknown"));
  assert.equal(demoListUrl("https://evil.test", "<script>&/post", "other"), "/demo?tab=morning&sort=kana&search=%3Cscript%3E%26%2Fpost");
});
