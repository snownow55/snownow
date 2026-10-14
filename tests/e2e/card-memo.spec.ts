import { test, expect, type Page } from "@playwright/test";

const fixture = "http://127.0.0.1:54321";
const row = { id: 1, resort: "オーンズ", area: "山頂・上部", snow_type: "パウダー", snowfall: "ほぼ無し",
  roughness: "きれい", crowd: "空いている", condition: null, comment: "短い現地メモ", created_at: "2026-10-14T12:01:00Z" };
const owns = (page: Page) => page.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
async function layoutReady(page: Page) {
  await owns(page).getByLabel("現地コメント", { exact: true }).evaluate(async () => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
}
test.beforeEach(async ({ request, page }) => {
  await request.post(fixture + "/__control", { data: { reset: true, posts: [row] } });
  await page.route("**/*", async (route) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)) throw new Error("Unexpected external request");
    await route.continue();
  });
});
test.afterEach(async ({ request }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
});

test("Japanese post date sits below relative time and never uses the current date", async ({ page, request }) => {
  await page.clock.setFixedTime(new Date("2030-01-01T00:00:00Z"));
  await page.goto("/");
  const card = owns(page);
  const absolute = card.getByLabel("投稿日時（日本時間）", { exact: true });
  await expect(absolute).toHaveText("10月14日 21:01");
  await expect(absolute).toHaveAttribute("datetime", row.created_at);
  const relative = card.getByLabel("投稿からの経過時間", { exact: true });
  await expect(relative).toHaveText(/^\d+日前$/);
  const a = (await absolute.boundingBox())!;
  const r = (await relative.boundingBox())!;
  expect(a.y).toBeGreaterThanOrEqual(r.y + r.height);
  const empty = page.getByRole("article", { name: "さっぽろばんけい", exact: true });
  await expect(empty.getByText("現地投稿なし", { exact: true })).toBeVisible();
  await expect(empty.locator("time")).toHaveCount(0);
  await expect(empty.getByLabel("投稿からの経過時間", { exact: true })).toHaveCount(0);
  await expect(empty.getByRole("group", { name: "現地メモ", exact: true })).toHaveCount(0);
  await expect(card.getByLabel("現地コメント", { exact: true })).toBeVisible();
  await expect(card.getByText("山頂・上部", { exact: false })).toBeVisible();
  await request.post(fixture + "/__control", { data: { posts: [{ ...row, created_at: "2026-12-31T15:05:00Z" }] } });
  await page.reload();
  await expect(absolute).toHaveText("1月1日 00:05");
});

for (const width of [320, 390, 1280]) {
  test(`long memo wraps, expands fully and closes without changing links at ${width}px`, async ({ page, request }) => {
    const comment = '<script>window.memoExecuted=true</script>\n' + "現地の長いコメント".repeat(50) + "\nhttps://example.test/" + "a".repeat(150);
    await request.post(fixture + "/__control", { data: { posts: [{ ...row, comment }] } });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const card = owns(page);
    const paragraph = card.getByLabel("現地コメント", { exact: true });
    await expect(paragraph).toBeVisible();
    await expect(paragraph).toHaveText(comment);
    const more = card.getByRole("button", { name: "続きを読む", exact: true });
    await expect(more).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    const collapsed = await paragraph.evaluate((el) => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }));
    expect(collapsed.height).toBeLessThanOrEqual(collapsed.line * 2 + 1);
    await more.click();
    const close = card.getByRole("button", { name: "閉じる", exact: true });
    await expect(close).toHaveAttribute("aria-expanded", "true");
    await expect(close).toHaveAttribute("aria-controls", (await paragraph.getAttribute("id"))!);
    const expanded = await paragraph.evaluate((el) => ({ height: el.getBoundingClientRect().height, scrollHeight: el.scrollHeight }));
    expect(expanded.height).toBeGreaterThan(collapsed.height);
    expect(expanded.height + 1).toBeGreaterThanOrEqual(expanded.scrollHeight);
    await close.click();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    expect(await paragraph.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(collapsed.line * 2 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => "memoExecuted" in window)).toBe(false);
    await expect(card.locator("script, img, details, summary")).toHaveCount(0);
    const postUrl = (await card.getByRole("link", { name: "投稿する", exact: true }).getAttribute("href"))!;
    expect(new URL(postUrl, page.url()).searchParams.get("resort")).toBe("オーンズ");
    await card.screenshot({ path: test.info().outputPath("memo-collapsed.png") });
    await card.getByRole("link", { name: "詳細を見る", exact: true }).click();
    await expect(page.getByRole("heading", { name: "スノークルーズオーンズ", level: 1, exact: true })).toBeVisible();
    await expect(page.locator("article")).toContainText(comment);
    expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
  });
}

test("zero, one and exactly two lines never get an unnecessary read-more button", async ({ page, request }) => {
  for (const [comment, area] of [["", "中腹"], ["   ", ""], ["短いメモ", ""], ["1行目\n2行目", "中腹"]]) {
    await request.post(fixture + "/__control", { data: { posts: [{ ...row, comment, area }] } });
    await page.goto("/");
    const card = owns(page);
    await expect(card.getByLabel("投稿日時（日本時間）", { exact: true })).toBeVisible();
    if (comment.trim()) {
      await expect(card.getByLabel("現地コメント", { exact: true })).toBeVisible();
      await layoutReady(page);
    } else await expect(card.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
    if (area) await expect(card.getByText("ゲレンデ内の位置", { exact: true }).locator("..")).toContainText(area);
    else await expect(card.getByText("ゲレンデ内の位置", { exact: true })).toHaveCount(0);
    if (!comment.trim() && !area) await expect(card.getByRole("group", { name: "現地メモ", exact: true })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "続きを読む", exact: true })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "閉じる", exact: true })).toHaveCount(0);
  }
});

test("read-more is remeasured after resizing, and new posts start collapsed", async ({ page, request }) => {
  const comment = "あ".repeat(60);
  await request.post(fixture + "/__control", { data: { posts: [{ ...row, comment }] } });
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/");
  const card = owns(page);
  const more = card.getByRole("button", { name: "続きを読む", exact: true });
  await expect(more).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 1000 });
  await expect(more).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 1000 });
  await expect(more).toBeVisible();
  await more.click();
  await expect(card.getByRole("button", { name: "閉じる", exact: true })).toBeVisible();
  await request.post(fixture + "/__control", { data: { posts: [{ ...row, id: 2, comment: "新しい投稿\n" + "雪".repeat(90) }] } });
  await page.getByRole("region", { name: "エリア選択" }).getByRole("button", { name: "空知", exact: true }).click();
  await expect(page.getByRole("heading", { name: "空知のスキー場", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "エリア選択" }).getByRole("button", { name: "札幌近郊", exact: true }).click();
  await expect(card.getByLabel("現地コメント", { exact: true })).toContainText("新しい投稿");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByRole("button", { name: "閉じる", exact: true })).toHaveCount(0);
});
