import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPostDate } from "../lib/post-date.ts";

test("stored timestamps are formatted in Japan time with the specified month/day and zero-padded clock", () => {
  assert.equal(formatPostDate("2026-10-14T12:01:00Z"), "10月14日 21:01");
  assert.equal(formatPostDate("2026-10-14T21:01:00+09:00"), "10月14日 21:01");
  assert.equal(formatPostDate("2026-01-01T15:05:00Z"), "1月2日 00:05");
  assert.equal(formatPostDate("2025-12-31T18:09:00Z"), "1月1日 03:09");
  assert.equal(formatPostDate("2024-02-28T15:00:00Z"), "2月29日 00:00");
});
test("missing or invalid post dates never fall back to the current time", () => {
  for (const invalid of ["", " ", "not a timestamp"]) assert.equal(formatPostDate(invalid), "―");
});
