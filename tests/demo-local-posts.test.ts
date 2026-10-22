import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalPost, readLocalPosts, toPostInput } from "../lib/demo/local-posts.ts";
import { loadDemoCatalog } from "../lib/demo/master.ts";
import { sortDemoResorts } from "../lib/demo/data.ts";
const catalog = loadDemoCatalog();
const input = { ...toPostInput(catalog.posts[0]), resort: "オーンズ", comment: "<script>alert(1)</script>" };
const now = "2026-10-22T02:30:00.000Z";
test("local experience uses normal post validation and known internal resort names", () => {
  for (const invalid of [{ ...input, resort: "スノークルーズオーンズ" }, { ...input, snow_type: "偽" }, { ...input, comment: "x".repeat(1001) }, { ...input, condition: "★★★★★" }, { ...input, user_id: "fake" }]) assert.throws(() => createLocalPost(invalid, catalog.resorts, "id", now));
  const post = createLocalPost(input, catalog.resorts, "id", now);
  assert.equal(post.resort, "オーンズ");
  assert.equal(post.createdAt, now);
  assert.equal(post.comment, input.comment);
  assert.equal(createLocalPost({ ...input, comment: "" }, catalog.resorts, "id", now).comment, "");
  assert.equal(createLocalPost({ ...input, comment: "x".repeat(1000) }, catalog.resorts, "id", now).comment.length, 1000);
});
test("versioned local storage validates persisted posts without modifying samples", () => {
  const post = createLocalPost(input, catalog.resorts, "id", now);
  const raw = JSON.stringify({ version: 1, posts: [post] });
  assert.deepEqual(readLocalPosts(raw, catalog.resorts), [post]);
  assert.deepEqual(readLocalPosts(null, catalog.resorts), []);
  for (const bad of ["invalid", "null", JSON.stringify({ version: 2, posts: [] }), JSON.stringify({ version: 1, posts: [post, post] }), JSON.stringify({ version: 1, posts: [{ ...post, createdAt: "invalid" }] }), JSON.stringify({ version: 1, posts: [{ ...post, resort: "unknown" }] })]) assert.throws(() => readLocalPosts(bad, catalog.resorts));
  const combined = [...catalog.posts, post];
  assert.equal(sortDemoResorts(catalog.resorts, combined, "latest")[0].name, "オーンズ");
  assert.equal(catalog.posts.length, 30);
  assert.ok(catalog.posts.every((sample) => !("localId" in sample)));
});
