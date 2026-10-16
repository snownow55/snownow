import { test } from "node:test";
import assert from "node:assert/strict";
import { postErrorMessage } from "../lib/post-error.ts";

test("POST origin, session, and email refusals have distinct actionable messages", () => {
  assert.match(postErrorMessage(403, { error: "Forbidden" }), /URL/);
  assert.doesNotMatch(postErrorMessage(403, { error: "Forbidden" }), /メール/);
  assert.match(postErrorMessage(401, { error: "Authentication required" }), /もう一度ログイン/);
  assert.match(postErrorMessage(403, { error: "Email verification required" }), /メール確認済み/);
  assert.match(postErrorMessage(403, { error: "Email verification required" }), /匿名/);
});
test("unknown and malformed responses never become email claims or raw server text", () => {
  for (const payload of [null, [], "<script>unsafe</script>", {}, { error: "<script>unsafe</script>" }, { error: {} }]) {
    const message = postErrorMessage(403, payload);
    assert.match(message, /アクセス条件/);
    assert.doesNotMatch(message, /メール|script|unsafe/);
  }
  assert.match(postErrorMessage(500, null), /投稿に失敗/);
  assert.doesNotMatch(postErrorMessage(500, { error: "Email verification required" }), /メール/);
});
