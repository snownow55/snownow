import test from "node:test";
import assert from "node:assert/strict";
import { safeAnalyticsUrl } from "../lib/web-analytics.ts";
test("standard analytics restricts collection to the public app and removes URL secrets", () => {
  assert.equal(safeAnalyticsUrl("https://snowviking.jp/?token=secret#private"),"https://snowviking.jp/");
  assert.equal(safeAnalyticsUrl("https://snowviking.jp/resort/arbitrary-user-text?code=secret"),"https://snowviking.jp/resort/[name]");
  assert.equal(safeAnalyticsUrl("https://snowviking.jp/login?email=private@example.com"),"https://snowviking.jp/login");
  for (const url of ["https://preview.vercel.app/","https://snowviking.jp.evil.example/","https://snowviking.jp/auth/callback?code=secret","https://snowviking.jp/reset-password#token","https://snowviking.jp/demo","https://snowviking.jp/api/posts","invalid"]) assert.equal(safeAnalyticsUrl(url),null);
});
