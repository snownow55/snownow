import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext, canPost } from "../lib/auth-policy.ts";
import { siteOrigin } from "../lib/site-origin.ts";
import { validPost } from "../lib/post-validation.ts";
test("callback rejects external, protocol-relative and control-character destinations", () => {
  for (const path of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\nevil.test",
    "/auth/callback",
    "/reset-password",
    "/%2f%2fevil.test",
    "/%5cevil.test",
    null,
  ])
    assert.equal(safeNext(path), "/");
  assert.equal(
    safeNext("/post?resort=%E3%82%AD%E3%83%AD%E3%83%AD"),
    "/post?resort=%E3%82%AD%E3%83%AD%E3%83%AD",
  );
});
test("posting requires verified non-anonymous user", () => {
  for (const user of [
    null,
    {},
    { email_confirmed_at: "" },
    { email_confirmed_at: "2026-01-01", is_anonymous: true },
  ])
    assert.equal(canPost(user), false);
  assert.equal(
    canPost({ email_confirmed_at: "2026-01-01", is_anonymous: false }),
    true,
  );
});
const post = {
  resort: "オーンズ",
  area: "山頂・上部",
  snow_type: "パウダー",
  snowfall: "ほぼ無し",
  roughness: "きれい",
  crowd: "空いている",
  condition: "★★★★★",
  comment: "",
};
test("post validation preserves choices and rejects tampering", () => {
  assert.equal(validPost(post), true);
  for (const invalid of [
    null,
    [],
    {},
    { ...post, resort: "偽のスキー場" },
    { ...post, comment: "a".repeat(1001) },
    { ...post, user_id: "other-user" },
    { ...post, created_at: "2100-01-01" },
  ])
    assert.equal(validPost(invalid), false);
});

test("canonical site origin overrides request host and rejects unsafe configuration", () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://snow.example.test";
    assert.equal(
      siteOrigin("https://evil.test/auth/callback"),
      "https://snow.example.test",
    );
    for (const value of [
      "https://user:password@snow.example.test",
      "https://snow.example.test/path",
      "http://snow.example.test",
      "javascript:alert(1)",
    ]) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      assert.equal(siteOrigin("http://localhost:3000"), null);
    }
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = old;
  }
});
