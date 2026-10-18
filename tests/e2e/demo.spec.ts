import { test, expect } from "@playwright/test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../../proxy";
import { loadDemoCatalog } from "../../lib/demo/master";
import { RESORT_READINGS } from "../../lib/resort-sort";
const catalog = loadDemoCatalog();
const kana = catalog.resorts.filter((resort) => resort.region_code === "asahikawa-furano").sort((a, b) => new Intl.Collator("ja").compare(RESORT_READINGS[a.name], RESORT_READINGS[b.name]));
const fixture = "http://127.0.0.1:54321";

test.beforeEach(async ({ page, request, context }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
  // An existing persisted login must not make the demo initialize its auth client.
  await context.addCookies([{ name: "sb-127-auth-token", value: "invalid-unused-fixture-session", domain: "127.0.0.1", path: "/" }]);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port === "54321" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) throw new Error("Demo must never contact auth, posts, Supabase, or external services");
    if (!["GET", "HEAD"].includes(route.request().method())) throw new Error("Read-only demo issued a write");
    await route.continue();
  });
});

test.afterEach(async ({ request }) => {
  const stats = await (await request.get(fixture + "/__stats")).json();
  expect(stats.inserts).toBe(0);
  expect(stats.posts.map((post: { resort: string }) => post.resort)).toEqual(["オーンズ", "キロロ"]);
});

for (const width of [320, 390, 1280]) {
  test(`independent read-only demo works at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    // Clock is deliberately years away: all labels must still use the fixed scenario day.
    await page.clock.setFixedTime(new Date("2030-09-01T00:00:00Z"));
    await page.goto("/demo");
    const list = page.getByRole("region", { name: "デモのスキー場一覧" });
    await expect(list.getByRole("article")).toHaveCount(kana.length);
    await expect(list.locator("h2")).toHaveText(kana.map((r) => r.display_name));
    await expect(page.getByLabel("デモの注意事項")).toContainText("すべて架空のサンプル");
    await expect(page.getByLabel("デモの注意事項")).toContainText("2026年2月14日");
    await expect(list.getByText("未取得", { exact: true })).toHaveCount(30);
    await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "アカウント" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /ログイン|新規登録|投稿する|閲覧方法|課金/ })).toHaveCount(0);
    await expect(page.getByText(/接続設定が未完了|ログイン中/)).toHaveCount(0);
    await page.getByRole("tab", { name: "ゲレンデの今", exact: true }).click();
    await expect(list.locator("time")).toHaveCount(10);
    await expect(list).not.toContainText(/たった今|分前|時間前|日前/);
    await page.getByRole("button", { name: "最新投稿順", exact: true }).click();
    const sorted = [...kana].sort((a, b) => Date.parse(catalog.posts.filter((p) => p.resort === b.name).at(-1)!.createdAt) - Date.parse(catalog.posts.filter((p) => p.resort === a.name).at(-1)!.createdAt));
    await expect(list.locator("h2")).toHaveText(sorted.map((r) => r.display_name));
    const search = page.getByRole("searchbox");
    await search.fill("ほろ");
    await expect(list.getByRole("article")).toHaveCount(1);
    const saved = page.url();
    await list.getByRole("link").click();
    await expect(page.getByRole("heading", { name: "ほろたちスキー場", exact: true })).toBeVisible();
    const timeline = page.getByRole("list", { name: "デモ投稿の時系列" });
    await expect(timeline.getByRole("article")).toHaveCount(3);
    const dates = await timeline.locator("time").evaluateAll((els) => els.map((el) => el.getAttribute("datetime")!));
    expect(dates).toEqual(catalog.posts.filter((p) => p.resort === "ほろたちスキー場").map((p) => p.createdAt));
    await expect(timeline.locator("time").first()).toHaveText("2月14日 09:00");
    await expect(page.locator("form, textarea")).toHaveCount(0);
    await page.reload();
    await page.screenshot({ path: test.info().outputPath("detail.png"), fullPage: true });
    await page.getByRole("link", { name: "← デモのスキー場一覧", exact: true }).click();
    await expect(page).toHaveURL(saved);
    await expect(search).toHaveValue("ほろ");
    await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("tab", { name: "朝のコンディション", exact: true }).click();
    const morningSaved = page.url();
    await list.getByRole("link").click();
    await page.getByRole("link", { name: "一覧に戻って比較する", exact: true }).click();
    await expect(page).toHaveURL(morningSaved);
    await expect(page.getByRole("tab", { name: "朝のコンディション", exact: true })).toHaveAttribute("aria-selected", "true");
    await search.fill("<script>未知</script>");
    await expect(list.getByRole("article")).toHaveCount(0);
    await expect(page.locator("main script")).toHaveCount(0);
    await search.fill("");
    await expect(list.getByRole("article")).toHaveCount(10);
    await expect(list.locator("h2")).toHaveText(kana.map((r) => r.display_name));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByLabel("デモの注意事項")).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("list.png"), fullPage: true });
    for (const href of await page.getByRole("link").evaluateAll((els) => els.map((el) => el.getAttribute("href")!))) expect(href === "/demo" || href.startsWith("/demo/")).toBe(true);
  });
}

test("all 59 direct detail URLs show only the original area samples and reject unknown names", async ({ page }) => {
  test.setTimeout(120000);
  for (const resort of catalog.resorts) {
    await page.goto(`/demo/resort/${encodeURIComponent(resort.name)}?tab=live&search=demo&sort=latest&returnTo=https://evil.test`);
    await expect(page.getByRole("heading", { name: resort.display_name, exact: true })).toBeVisible();
    const count = resort.region_code === "asahikawa-furano" ? 3 : 0;
    await expect(page.getByRole("article")).toHaveCount(count);
    if (!count) {
      await expect(page.getByRole("heading", { name: "デモ投稿なし", exact: true })).toBeVisible();
      await expect(page.locator("main time, main dl")).toHaveCount(0);
    }
    const suffix = resort.region_code === "asahikawa-furano" ? "" : `&region=${resort.region_code}`;
    await expect(page.getByRole("link", { name: "← デモのスキー場一覧", exact: true })).toHaveAttribute("href", "/demo?tab=live&sort=latest&search=demo" + suffix);
  }
  for (const name of ["unknown"]) {
    const response = await page.goto(`/demo/resort/${encodeURIComponent(name)}`);
    // Next may stream the not-found UI with status 200; it must never show live data.
    expect([200, 404]).toContain(response!.status());
    await expect(page.getByRole("heading", { name: "デモ対象のスキー場が見つかりません", exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  }
});

test("proxy excludes only the dedicated demo namespace from session refresh", () => {
  for (const url of ["/demo", "/demo?tab=live", "/demo/resort/ほろたちスキー場"]) expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  for (const url of ["/", "/post", "/api/posts", "/login", "/demoevil"]) expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
});

for (const width of [320, 390, 1280]) {
  test(`all regions, empty cards and restored area filters work at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/demo?tab=live&sort=latest");
    const picker = page.getByRole("region", { name: "デモのエリア選択" });
    const choose = async (code: string, name: string) => {
      if (width < 768) await picker.getByRole("combobox").selectOption(code);
      else await picker.getByRole("button", { name, exact: true }).click();
    };
    const list = page.getByRole("region", { name: "デモのスキー場一覧" });
    for (const region of catalog.regions) {
      await choose(region.code, region.name);
      const expected = catalog.resorts.filter((resort) => resort.region_code === region.code);
      await expect(list.getByRole("article")).toHaveCount(expected.length);
      await expect(page.getByRole("heading", { name: `${region.name}のスキー場を比較`, exact: true })).toBeVisible();
      if (region.code !== "asahikawa-furano") {
        await expect(list.locator("time, dl")).toHaveCount(0);
        await expect(list.getByText("デモ投稿なし", { exact: true })).toHaveCount(expected.length);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await choose("sapporo", "札幌近郊");
    await page.getByRole("searchbox").fill("きろろ");
    await expect(list.getByRole("article")).toHaveCount(1);
    const home = page.url();
    await list.getByRole("link").click();
    await expect(page.getByRole("heading", { name: "キロロ", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "デモ投稿なし", exact: true })).toBeVisible();
    await expect(page.getByLabel("デモの注意事項")).toContainText("提携や公式情報の連携完了を意味しません");
    await page.reload();
    await page.screenshot({ path: test.info().outputPath("empty-detail.png"), fullPage: true });
    await page.getByRole("link", { name: "← デモのスキー場一覧", exact: true }).click();
    await expect(page).toHaveURL(home);
    await expect(page.getByRole("searchbox")).toHaveValue("きろろ");
    await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toHaveAttribute("aria-pressed", "true");
    if (width < 768) await expect(picker.getByRole("combobox")).toHaveValue("sapporo");
    else await expect(picker.getByRole("button", { name: "札幌近郊", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("searchbox").fill("");
    await choose("all", "北海道全域");
    await expect(list.getByRole("article")).toHaveCount(59);
    const cards = list.getByRole("article");
    for (let i = 0; i < 59; i++) {
      await expect(cards.nth(i).locator("time")).toHaveCount(i < 10 ? 1 : 0);
    }
    await expect(list.getByText("デモ投稿なし", { exact: true })).toHaveCount(49);
    const saved = page.url();
    await cards.nth(58).getByRole("link").click();
    await page.getByRole("link", { name: "一覧に戻って比較する", exact: true }).click();
    await expect(page).toHaveURL(saved);
    await page.getByRole("tab", { name: "朝のコンディション", exact: true }).click();
    await expect(list.getByText("未取得", { exact: true })).toHaveCount(177);
    await expect(list.getByText("デモ投稿なし", { exact: true })).toHaveCount(49);
    const morningSaved = page.url();
    await cards.last().getByRole("link").click();
    await page.getByRole("link", { name: "一覧に戻って比較する", exact: true }).click();
    await expect(page).toHaveURL(morningSaved);
    await page.screenshot({ path: test.info().outputPath("all-regions.png") });
    await page.goto("/demo?region=not-registered");
    await expect(page.getByRole("heading", { name: "旭川・富良野のスキー場を比較", exact: true })).toBeVisible();
  });
}
