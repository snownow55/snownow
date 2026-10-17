import { test, expect } from "@playwright/test";

const fixture = "http://127.0.0.1:54321";
test.beforeEach(async ({ request, page }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
  await page.route("**/*", async (route) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)) throw new Error("Unexpected external request");
    await route.continue();
  });
});
test.afterEach(async ({ request }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
});

for (const width of [320, 390, 1280]) {
  for (const tab of ["morning", "live"]) {
    test(`${tab} list survives detail navigation and reload at ${width}px`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 1000 });
      const params = new URLSearchParams({ region: "asahikawa-furano", tab, sort: "latest", search: "ほろ" });
      const home = `/?${params}`;
      await page.goto(home);
      const list = page.getByRole("region", { name: "スキー場一覧" });
      const card = list.getByRole("article", { name: "ほろたちスキー場", exact: true });
      await expect(list.getByRole("article")).toHaveCount(1);
      await expect(card.getByLabel("デモ情報の注意")).toContainText("実際の現地コンディションを示す情報ではありません");
      await expect(page.getByLabel("開発版について")).toContainText("未実装");
      if (tab === "morning") await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toHaveCount(0);
      else await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toHaveAttribute("aria-pressed", "true");
      await card.getByRole("link", { name: tab === "morning" ? "今のゲレンデコンディションを見る" : "詳細を見る", exact: true }).click();
      await expect(page.getByRole("heading", { name: "ほろたちスキー場", exact: true })).toBeVisible();
      await expect(page.getByLabel("デモ情報の注意")).toBeVisible();
      await expect(page.getByLabel("開発版について")).toContainText("詳細ページ・APIの投稿情報は現在公開");
      const post = new URL((await page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false }).getAttribute("href"))!, page.url());
      expect(post.searchParams.get("resort")).toBe("ほろたちスキー場");
      await page.reload();
      const back = page.getByRole("link", { name: "← スキー場一覧", exact: true });
      await expect(back).toHaveAttribute("href", home);
      await page.screenshot({ path: test.info().outputPath("detail.png"), fullPage: true });
      await back.click();
      await expect(page).toHaveURL(`http://127.0.0.1:3100${home}`);
      await expect(page.getByRole("tab", { name: tab === "morning" ? "朝のコンディション" : "ゲレンデの今", exact: false })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("searchbox")).toHaveValue("ほろ");
      await expect(list.getByRole("article")).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "旭川・富良野のスキー場", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath("home.png"), fullPage: true });
      expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
    });
  }
}

test("detail rejects unsafe return URLs and preserves existing direct URLs", async ({ page }) => {
  for (const returnTo of [null, "https://evil.test", "//evil.test", "/\\evil.test", "/post", "/%2f%2fevil.test"]) {
    await page.goto("/resort/" + encodeURIComponent("オーンズ") + (returnTo === null ? "" : "?" + new URLSearchParams({ returnTo })));
    await expect(page.getByRole("link", { name: "← スキー場一覧", exact: true })).toHaveAttribute("href", "/?region=sapporo");
    await expect(page.getByRole("article")).toContainText("<script>fixture</script>");
    await expect(page.getByLabel("デモ情報の注意")).toHaveCount(0);
  }
  await page.goto("/resort/unknown?" + new URLSearchParams({ returnTo: "/?tab=live&region=sorachi&search=萩" }));
  await expect(page.getByRole("link", { name: "スキー場一覧へ戻る", exact: true })).toHaveAttribute("href", "/?region=sorachi&tab=live&search=%E8%90%A9");
});
