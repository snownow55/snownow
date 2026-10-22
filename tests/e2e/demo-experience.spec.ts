import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DEMO_STORAGE_KEY } from "../../lib/demo/local-posts";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:3100" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || !["GET", "HEAD"].includes(request.method())) throw new Error("Demo experience attempted network access/write outside demo");
    await route.continue();
  });
});
for (const width of [320, 390, 1280]) {
  test(`local-only posting, persistence and browser isolation at ${width}px`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date("2026-10-22T02:30:00Z"));
    await page.goto("/demo?tab=live&region=sapporo&search=オーンズ");
    const card = page.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
    await expect(card).toContainText("デモ投稿なし");
    await card.getByRole("link", { name: "投稿を体験する", exact: true }).click();
    const form = page.getByRole("form", { name: "体験投稿フォーム" });
    await expect(form).toBeVisible();
    // Compare every choice against the untouched normal production form.
    const source = readFileSync("app/(app)/post/page.tsx", "utf8");
    for (const [normalId, demoId] of [["slope-area", "area"], ["snow-type", "snow_type"], ["snowfall", "snowfall"], ["roughness", "roughness"], ["crowd", "crowd"]]) {
      const block = source.split(`id="${normalId}"`)[1].split("</select>")[0];
      const options = [...block.matchAll(/<option>(.*?)<\/option>/g)].map((match) => match[1]);
      await expect(form.locator(`#demo-${demoId} option`)).toHaveText(options);
      await form.locator(`#demo-${demoId}`).selectOption(options.at(-1)!);
    }
    await expect(form.getByRole("textbox")).toHaveAttribute("maxlength", "1000");
    const comment = "<script>window.demoAttack=true</script>\n体験用の長いコメント".repeat(12);
    await form.getByRole("textbox").fill(comment);
    await page.screenshot({ path: test.info().outputPath("form.png"), fullPage: true });
    await form.getByRole("button", { name: "体験投稿を保存する", exact: true }).click();
    await expect(page.getByRole("tab", { name: "ゲレンデの今", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(card).toContainText("体験投稿・このブラウザのみ");
    await expect(card).toContainText(comment);
    await expect(card.locator("time")).toHaveAttribute("datetime", "2026-10-22T02:30:00.000Z");
    await expect(card.locator("time")).toContainText("11:30");
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), DEMO_STORAGE_KEY);
    expect(saved.posts).toHaveLength(1);
    expect(saved.posts[0].resort).toBe("オーンズ");
    await page.reload();
    await expect(card).toContainText(comment);
    await card.getByRole("link", { name: "詳細を見る", exact: true }).click();
    await expect(page.getByRole("list", { name: "デモ投稿の時系列" }).getByRole("article")).toHaveCount(1);
    await expect(page.locator("main script")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("posted.png"), fullPage: true });
    // Samples remain intact when another resort receives an experience post.
    await page.goto("/demo/resort/" + encodeURIComponent("ほろたちスキー場"));
    await expect(page.getByRole("list", { name: "デモ投稿の時系列" }).getByRole("article")).toHaveCount(3);
    await page.getByRole("button", { name: "投稿を体験する", exact: true }).click();
    await page.getByRole("form").getByRole("button", { name: "体験投稿を保存する", exact: true }).click();
    await page.getByRole("link", { name: "詳細を見る", exact: true }).click();
    const timeline = page.getByRole("list", { name: "デモ投稿の時系列" });
    await expect(timeline.getByRole("article")).toHaveCount(4);
    await expect(timeline.getByRole("article").last()).toContainText("体験投稿・このブラウザのみ");
    const separate = await browser.newContext();
    const other = await separate.newPage();
    await other.goto("http://127.0.0.1:3100/demo/resort/" + encodeURIComponent("オーンズ"));
    await expect(other.getByRole("heading", { name: "デモ投稿なし", exact: true })).toBeVisible();
    await separate.close();
  });
}

test("blocked storage preserves input and never claims success", async ({ page }) => {
  await page.goto("/demo/resort/" + encodeURIComponent("キロロ"));
  await page.getByRole("button", { name: "投稿を体験する", exact: true }).click();
  await page.getByRole("textbox").fill("入力を消さない");
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "体験投稿を保存する", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("保存できませんでした");
  await expect(page.getByRole("textbox")).toHaveValue("入力を消さない");
  await expect(page.getByRole("article")).toHaveCount(0);
});
test("corrupt storage is not overwritten and saving is disabled", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "corrupt"), DEMO_STORAGE_KEY);
  await page.goto("/demo/resort/" + encodeURIComponent("キロロ"));
  await expect(page.getByRole("main").getByRole("alert")).toContainText("保存データを読み込めません");
  await page.getByRole("button", { name: "投稿を体験する", exact: true }).click();
  await expect(page.getByRole("button", { name: "体験投稿を保存する", exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEMO_STORAGE_KEY)).toBe("corrupt");
});
