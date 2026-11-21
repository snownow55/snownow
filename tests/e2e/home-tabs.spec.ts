import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { selectRegion } from "./region-picker";
const fixture = "http://127.0.0.1:54321";
const master = JSON.parse(readFileSync("data/resort-master.json", "utf8"));
master.resorts = master.resorts.map((resort: object, index: number) => ({ ...resort, id: index + 1, is_active: true }));
test.beforeEach(async ({ page, request }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Unexpected external request");
    if (url.pathname === "/rest/v1/regions" || url.pathname === "/rest/v1/resorts") return route.fulfill({ json: master[url.pathname.endsWith("regions") ? "regions" : "resorts"] });
    if (url.pathname === "/rest/v1/official_morning_conditions") return route.fulfill({ json: [] });
    await route.continue();
  });
});
test.afterEach(async ({ request }) => { await request.post(fixture + "/__control", { data: { reset: true } }); });
for (const width of [320, 390, 1280]) {
  test(`free public posts and guide, empty cards and retained filters at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/?region=sapporo");
    const list = page.getByRole("region", { name: "スキー場一覧", exact: true });
    await expect(list.getByRole("article")).toHaveCount(14);
    await expect(list.locator("dd")).toHaveText(Array(42).fill("—"));
    await expect(list.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
    const owns = list.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
    await expect(owns.getByLabel("現地コメント", { exact: true })).toHaveText("<script>fixture</script>");
    await expect(owns.locator("script")).toHaveCount(0);
    await expect(owns.getByRole("definition")).toHaveText(["パウダー", "きれい", "ほぼ無し", "空いている"]);
    await expect(owns.getByLabel("投稿日時（日本時間）", { exact: true })).toBeVisible();
    await expect(list.getByRole("article", { name: "キロロスノーワールド", exact: true }).getByLabel("現地コメント", { exact: true })).toHaveText("キロロの既存投稿");
    const empty = list.getByRole("article", { name: "さっぽろばんけいスキー場", exact: true });
    await expect(empty.getByText("現地投稿なし", { exact: true })).toBeVisible();
    await expect(empty.locator("time")).toHaveCount(0);
    await expect(list.getByText("投稿内容はロック中", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText("月額500円");
    await expect(page.getByRole("main")).not.toContainText("チケット");
    await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "最新投稿順", exact: true }).click();
    await expect(list.getByRole("article").first()).toHaveAccessibleName("キロロスノーワールド");
    await page.getByRole("searchbox").fill("きろろ");
    await expect(list.getByRole("article")).toHaveCount(1);
    await list.getByRole("link", { name: "詳細を見る", exact: false }).click();
    await expect(page.getByRole("heading", { name: "キロロスノーワールド", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "← スキー場一覧", exact: true }).click();
    await expect(page.getByRole("searchbox")).toHaveValue("きろろ");
    await expect(page.getByRole("tab", { name: "ゲレンデの今", exact: false })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "検索をクリア", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`free-home-${width}.png`), fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "閲覧方法を見る", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ログインなしで無料閲覧", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "投稿にはログインが必要です", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("月額500円");
    await expect(page.getByRole("main")).not.toContainText("チケット");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
  });
}
test("public read failures do not masquerade as no posts or retain the previous region's body", async ({ page }) => {
  await page.goto("/?region=sapporo&tab=live");
  await expect(page.getByLabel("現地コメント", { exact: true }).first()).toBeVisible();
  await page.route(fixture + "/rest/v1/snow_posts?**", (route) => route.fulfill({ status: 403, json: {} }));
  await selectRegion(page, "空知");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("投稿情報を取得できませんでした");
  await expect(page.getByText("現地投稿なし", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "投稿する", exact: false }).first()).toBeVisible();
});
test("free reading does not bypass the posting login requirement", async ({ page }) => {
  await page.goto("/?region=sapporo&tab=live");
  const card = page.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
  await expect(card.getByLabel("現地コメント", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: "投稿する", exact: false }).click();
  await expect(page.getByRole("heading", { name: "投稿にはログインが必要です", exact: true })).toBeVisible();
});
