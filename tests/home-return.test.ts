import { test } from "node:test";
import assert from "node:assert/strict";
import { safeHomeReturn, resortDetailUrl } from "../lib/home-return.ts";

test("home return preserves list state and encodes names and search as data", () => {
  const home = "/?" + new URLSearchParams({ region: "asahikawa-furano", tab: "live", sort: "latest", search: "ほろ & #? / 雪" });
  assert.equal(safeHomeReturn(home), home);
  const detail = new URL(resortDetailUrl("Fu'sスノーエリア", home), "https://snow.invalid");
  assert.equal(decodeURIComponent(detail.pathname), "/resort/Fu'sスノーエリア");
  assert.equal(detail.searchParams.get("returnTo"), home);
  assert.equal(safeHomeReturn("/?tab=other&sort=other&next=https://evil.test"), "/?tab=morning&sort=kana");
  assert.equal(new URL(safeHomeReturn("/?search=" + "a".repeat(201))!, "https://snow.invalid").searchParams.get("search")!.length, 200);
});

test("home return rejects external, ambiguous and non-home destinations", () => {
  for (const value of [null, undefined, "", "https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", "/%2f%2fevil.test", "/post", "/auth/callback", "/?tab=live#evil", "/?region=https%3A%2F%2Fevil.test"]) {
    assert.equal(safeHomeReturn(value), null);
  }
  assert.equal(resortDetailUrl("オーンズ", "//evil.test"), "/resort/" + encodeURIComponent("オーンズ"));
});
