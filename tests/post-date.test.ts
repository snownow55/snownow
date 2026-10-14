import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPostAge, formatPostDate } from "../lib/post-date.ts";

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

test("relative ages use the stored date, handle minute/hour/day boundaries and invalid dates", () => {
  const date = "2026-10-14T12:01:00Z";
  const start = Date.parse(date);
  for (const [minutes, expected] of [[0, "たった今"], [0.99, "たった今"], [1, "1分前"], [15, "15分前"], [59, "59分前"], [60, "1時間前"], [1439, "23時間前"], [1440, "1日前"]] as const) {
    assert.equal(formatPostAge(date, start + minutes * 60000), expected);
  }
  assert.equal(formatPostAge(date, start - 60000), "たった今");
  assert.equal(formatPostAge("invalid", start), "―");
  assert.equal(formatPostAge("", start), "―");
  assert.equal(formatPostAge(date, NaN), "―");
});
