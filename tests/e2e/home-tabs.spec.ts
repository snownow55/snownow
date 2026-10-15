import { selectRegion } from "./region-picker";
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
  test(`two source tabs, placeholder-only cards and guide work at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1000 });
    const selections: string[] = [];
    const responses: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname === "/rest/v1/snow_posts") selections.push(url.searchParams.get("select")!);
    });
    page.on("response", async (response) => {
      if (new URL(response.url()).pathname === "/rest/v1/snow_posts") responses.push(await response.text());
    });
    await page.goto("/");
    const morning = page.getByRole("tab", { name: "朝のコンディション", exact: false });
    const live = page.getByRole("tab", { name: "ゲレンデの今", exact: false });
    await expect(morning).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "朝のコンディション", exact: false })).toBeVisible();
    const list = page.getByRole("region", { name: "スキー場一覧" });
    await expect(list.getByRole("article")).toHaveCount(13);
    await expect(list.locator("dd")).toHaveText(Array(39).fill("未取得"));
    await expect(list.locator("time")).toHaveCount(0);
    await expect(list.getByRole("link")).toHaveCount(13);
    await expect(list.getByRole("link", { name: "詳細を見る", exact: true })).toHaveCount(0);
    await expect(list.getByRole("link", { name: "投稿する", exact: true })).toHaveCount(0);
    const morningLink = list.getByRole("article", { name: "スノークルーズオーンズ", exact: true }).getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true });
    const fit = await morningLink.evaluate((el) => ({ width: el.clientWidth, content: el.scrollWidth, height: el.getBoundingClientRect().height }));
    expect(fit.content).toBeLessThanOrEqual(fit.width);
    expect(fit.height).toBeGreaterThanOrEqual(44);
    await morningLink.screenshot({ path: test.info().outputPath("morning-action.png") });
    await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toBeEnabled();
    await expect(page.getByText("滑る前に、ゲレンデの今を。", { exact: true })).toHaveCount(0);
    await expect(page.getByText("朝の公式情報と、ユーザーが伝えるゲレンデの今。", { exact: true })).toHaveCount(0);
    const picker = page.getByRole("region", { name: "エリア選択" });
    if (width < 768) {
      await expect(picker.getByRole("combobox")).toHaveValue("sapporo");
      await expect(picker.getByRole("button")).toHaveCount(0);
      expect((await list.getByRole("article").first().boundingBox())!.y).toBeLessThan(680);
    } else await expect(picker.getByRole("button")).toHaveCount(9);
    const before = selections.length;
    await live.click();
    await expect(live).toHaveAttribute("aria-selected", "true");
    expect(await live.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(8, 125, 137)");
    await expect(list.getByRole("article")).toHaveCount(13);
    await expect(list.getByRole("link", { name: "閲覧方法を見る", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "閲覧方法を見る", exact: true })).toHaveCount(1);
    await expect(list.getByRole("link", { name: "投稿する", exact: true })).toHaveCount(13);
    await expect(list.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
    await expect(list.locator("time")).toHaveCount(2);
    await expect(list.locator("details, summary")).toHaveCount(0);
    const html = await list.innerHTML();
    for (const forbidden of ["fixture</script>", "キロロの既存投稿", "パウダー", "ほぼ無し", "山頂・上部", "空いている"]) expect(html).not.toContain(forbidden);
    expect(selections.length).toBe(before);
    expect(selections.length).toBe(13);
    expect(selections.every((select) => select === "created_at")).toBe(true);
    expect(responses.length).toBe(13);
    for (const response of responses) expect(JSON.parse(response).every((row: object) => Object.keys(row).join(",") === "created_at")).toBe(true);
    const first = list.getByRole("article").first();
    expect((await first.boundingBox())!.height).toBeLessThan(230);
    const empty = list.getByRole("article", { name: "さっぽろばんけい", exact: true });
    await expect(empty.getByLabel("投稿状況", { exact: true })).toHaveText("投稿なし");
    await expect(empty.locator("time")).toHaveCount(0);
    await selectRegion(page, "空知");
    await expect(list.getByRole("article")).toHaveCount(6);
    await selectRegion(page, "札幌近郊");
    await expect(list.getByRole("article")).toHaveCount(13);
    await page.getByRole("searchbox").fill("きろろ");
    await expect(list.getByRole("article")).toHaveCount(1);
    await morning.click();
    await expect(page.getByRole("searchbox")).toHaveValue("きろろ");
    await expect(list.getByRole("article")).toHaveCount(1);
    await live.click();
    await page.screenshot({ path: test.info().outputPath("locked-home.png") });
    await list.getByRole("article").first().screenshot({ path: test.info().outputPath("locked-card.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "閲覧方法を見る", exact: true }).click();
    await expect(page.getByRole("heading", { name: "現地情報の閲覧方法", exact: true })).toBeVisible();
    for (const rule of ["現地投稿は無料", "1投稿で閲覧チケット1枚", "2時間に1回", "保有上限は3枚", "1時間閲覧", "全スキー場", "7日間無料体験", "本人が開始", "実装していません"]) await expect(page.getByRole("main")).toContainText(rule);
    await expect(page.getByRole("heading", { name: "月額500円で見放題", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "トップページへ戻る", exact: true }).click();
    await expect(morning).toHaveAttribute("aria-selected", "true");
    expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
  });
}

test("keyboard tabs retain filters and sort order; locked posting survives login", async ({ page }) => {
  await page.goto("/");
  const morning = page.getByRole("tab", { name: "朝のコンディション", exact: false });
  const live = page.getByRole("tab", { name: "ゲレンデの今", exact: false });
  await morning.focus();
  await page.keyboard.press("ArrowRight");
  await expect(live).toBeFocused();
  await expect(live).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "最新投稿順", exact: true }).click();
  await selectRegion(page, "旭川・富良野");
  await expect(live).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toHaveAttribute("aria-pressed", "true");
  await live.focus();
  await page.keyboard.press("Home");
  await expect(morning).toBeFocused();
  await page.keyboard.press("End");
  await expect(live).toBeFocused();
  const card = page.getByRole("article", { name: "カムイスキーリンクス", exact: true });
  await card.getByRole("link", { name: "投稿する", exact: true }).click();
  await page.getByRole("main").getByRole("link", { name: "ログイン", exact: true }).click();
  await page.getByLabel("メールアドレス").fill("snow@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "カムイスキーリンクスのコンディションを投稿", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByLabel("エリア", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").getByLabel("スキー場", { exact: true })).toHaveCount(0);
});

test("free post timestamps use stored Japan time and distinguish loading, absence, and read failures", async ({ page, request }) => {
  await page.clock.setFixedTime(new Date("2026-10-14T12:46:00Z"));
  await request.post(fixture + "/__control", { data: { posts: [{ id: 1, resort: "オーンズ", created_at: "2026-10-14T12:31:00Z",
    area: "中腹", snow_type: "パウダー", snowfall: "ほぼ無し", roughness: "きれい", crowd: "空いている", condition: null, comment: "クライアントに渡さない現地メモ" }] } });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route(fixture + "/rest/v1/snow_posts?**", async (route) => { await pending; await route.continue(); });
  const owns = page.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
  try {
    await page.goto("/");
    await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
    await expect(owns.getByLabel("投稿状況", { exact: true })).toHaveText("投稿日時を読み込み中…");
    await expect(owns.locator("time")).toHaveCount(0);
    release();
    await expect(owns.getByLabel("投稿状況", { exact: true })).toContainText("最新投稿あり");
    await expect(owns.getByLabel("投稿からの経過時間", { exact: true })).toHaveText("15分前");
    await expect(owns.getByLabel("投稿日時（日本時間）", { exact: true })).toHaveText("10月14日 21:31");
    await expect(owns.locator("time")).toHaveAttribute("datetime", "2026-10-14T12:31:00Z");
    await expect(page.getByRole("article", { name: "キロロ", exact: true }).getByLabel("投稿状況", { exact: true })).toHaveText("投稿なし");
    expect(await page.getByRole("main").innerHTML()).not.toContain("クライアントに渡さない現地メモ");
  } finally { release(); }
  await page.unroute(fixture + "/rest/v1/snow_posts?**");
  // A definitive permission failure avoids the SDK's transient-503 retry delay.
  await page.route(fixture + "/rest/v1/snow_posts?**", (route) => route.fulfill({ status: 403, contentType: "application/json", body: "{}" }));
  await page.reload();
  await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
  await expect(owns.getByLabel("投稿状況", { exact: true })).toHaveText("投稿日時を取得できません");
  await expect(page.getByText("投稿なし", { exact: true })).toHaveCount(0);
  await expect(owns.locator("time")).toHaveCount(0);
  await expect(owns.getByRole("link", { name: "投稿する", exact: true })).toBeVisible();
});
