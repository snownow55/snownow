import { test, expect, type Locator } from "@playwright/test";

const fixture = "http://127.0.0.1:54321";
test.beforeEach(async ({ page, request }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !["GET", "HEAD"].includes(route.request().method())) throw new Error("Unexpected external access or write");
    await route.continue();
  });
});
test.afterEach(async ({ request }) => {
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
});

async function verifyConditions(group: Locator) {
  await expect(group).toBeVisible();
  await expect(group.locator("dt")).toHaveText(["新雪量", "雪質", "積雪量", "気温"]);
  await expect(group.locator("dd")).toHaveText(Array(4).fill("未取得"));
  const date = group.getByLabel("公式情報の発表日時", { exact: true });
  await expect(date).toHaveText("発表日時：未取得");
  expect(await group.evaluate((element) => {
    const boxes = [...element.querySelectorAll("dl > div")].map((cell) => cell.getBoundingClientRect());
    const date = element.querySelector("p")!;
    return boxes.length === 4 && boxes[0].top === boxes[1].top && boxes[2].top === boxes[3].top
      && boxes[0].left === boxes[2].left && boxes[1].left === boxes[3].left && boxes[0].right <= boxes[1].left
      && boxes[0].bottom <= boxes[2].top && boxes[2].bottom <= date.getBoundingClientRect().top
      && parseFloat(getComputedStyle(date).fontSize) < parseFloat(getComputedStyle(element.querySelector("dd")!).fontSize);
  })).toBe(true);
  await expect(group).not.toContainText(/cm|℃|パウダー|圧雪/);
}

for (const width of [320, 390, 1280]) {
  test(`official cards and details share the unknown-only two by two layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const demo of [false, true]) {
      await page.goto(demo ? "/demo" : "/");
      const card = page.getByRole("region", { name: demo ? "デモのスキー場一覧" : "スキー場一覧", exact: true }).getByRole("article").first();
      await verifyConditions(card.getByRole("group", { name: "朝の公式情報", exact: true }));
      await card.screenshot({ path: test.info().outputPath(demo ? "demo-card.png" : "app-card.png") });
      await card.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
      const section = page.getByRole("region", { name: "朝のコンディション（公式情報）", exact: true });
      await verifyConditions(section.getByRole("group", { name: "朝の公式情報", exact: true }));
      await section.screenshot({ path: test.info().outputPath(demo ? "demo-detail.png" : "app-detail.png") });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    // Sample snow quality must remain confined to its clearly separate posts.
    await page.goto("/demo/resort/" + encodeURIComponent("ほろたちスキー場"));
    await verifyConditions(page.getByRole("group", { name: "朝の公式情報", exact: true }));
    await expect(page.getByRole("list", { name: "デモ投稿の時系列" }).getByRole("article")).toHaveCount(3);
    await expect(page.getByRole("list", { name: "デモ投稿の時系列" })).toContainText("硬めの圧雪");
    await expect(page.getByLabel("デモの注意事項")).toContainText("すべて架空");
    await page.goto("/resort/" + encodeURIComponent("オーンズ"));
    await verifyConditions(page.getByRole("group", { name: "朝の公式情報", exact: true }));
    await expect(page.getByRole("article")).toContainText("パウダー");
  });
}
