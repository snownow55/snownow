import { test } from "node:test";
import assert from "node:assert/strict";
import { choices, validPost } from "../lib/app-post-validation.ts";
import { choices as demoChoices, validPost as validDemoPost } from "../lib/post-validation.ts";
import { validEdit } from "../lib/post-edit.ts";
const fields = { area: "中腹", snow_type: "湿雪", snowfall: "ほぼ無し", roughness: "きれい", crowd: "普通", comment: "湿雪テスト" };
test("real app enables wet snow for posts and edits without removing existing choices", () => {
  assert.deepEqual(choices.snow_type.filter(v => v !== "湿雪"), demoChoices.snow_type);
  assert.equal(choices.snow_type.filter(v => v === "湿雪").length, 1);
  assert.equal(validPost({ ...fields, resort: "オーンズ" }), true);
  assert.equal(validEdit(fields), true);
  assert.equal(validPost({ ...fields, snow_type: "シャバ雪・べちゃ雪", resort: "オーンズ" }), true);
  assert.equal(validPost({ ...fields, snow_type: "invalid", resort: "オーンズ" }), false);
  assert.equal(validEdit({ ...fields, created_at: "tampered" }), false);
});
test("sales demo retains its original choices and rejects new wet-snow submissions", () => {
  assert.equal(demoChoices.snow_type.includes("湿雪"), false);
  assert.equal(validDemoPost({ ...fields, resort: "オーンズ" }), false);
});
