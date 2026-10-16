import { selectRegion } from "./region-picker";
import { test, expect } from "@playwright/test";

const fixture = "http://127.0.0.1:54321";
test.beforeEach(async ({ request, page }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
  await page.route("**/*", async (route) => {
    if (!["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname))
      throw new Error("Unexpected external request");
    await route.continue();
  });
});
test.afterEach(async ({ request }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
});

test("area search matches names and kana without extra post reads or changing resort links", async ({ page, request }) => {
  let postReads = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/rest/v1/snow_posts" && req.method() === "GET") postReads++;
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toBeEnabled();
  const initialReads = postReads;
  const search = page.getByRole("searchbox");
  const cards = page.getByRole("region", { name: "スキー場一覧" }).getByRole("article");
  for (const [query, display, canonical] of [
    ["きろろ", "キロロ", "キロロ"], ["キロロ", "キロロ", "キロロ"],
    ["オーンズ", "スノークルーズオーンズ", "オーンズ"],
    ["すのーくるーず", "スノークルーズオーンズ", "オーンズ"],
    ["ふっず", "Fu'sスノーエリア", "Fu'sスノーエリア"], ["Ｆｕ", "Fu'sスノーエリア", "Fu'sスノーエリア"],
  ]) {
    await search.fill(query);
    await expect(cards).toHaveCount(1);
    await expect(cards.getByRole("heading", { level: 3 })).toHaveText(display);
    const href = await cards.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).getAttribute("href");
    expect(new URL(href!, page.url()).pathname).toBe("/resort/" + encodeURIComponent(canonical));
  }
  await search.fill("<script>未登録</script>");
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("検索に一致するスキー場がありません。検索語を変更してください。", { exact: true })).toBeVisible();
  await expect(page.locator("main script")).toHaveCount(0);
  await page.getByRole("button", { name: "検索をクリア", exact: true }).click();
  await expect(cards).toHaveCount(13);
  expect(postReads).toBe(initialReads);
  await page.getByRole("button", { name: "最新投稿順", exact: true }).click();
  await search.fill("キロロ");
  await selectRegion(page, "空知");
  await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(0);
  await page.getByRole("button", { name: "検索をクリア", exact: true }).click();
  await expect(cards).toHaveCount(6);
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
});

for (const width of [320, 390, 1280]) {
  test(`brand theme remains light across top, detail, post and auth at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page).toHaveTitle("SNOW VIKING");
    await expect(page.getByRole("heading", { name: "スキー場のコンディション", level: 1 })).toBeVisible();
    await expect(page.getByText("LOGO 準備中", { exact: true })).toHaveCount(0);
    const logo = page.getByRole("img", { name: "SNOW VIKING 公式マスコット", exact: true });
    await expect(logo).toHaveCount(1);
    await expect(logo).toBeVisible();
    await expect(logo).toHaveJSProperty("complete", true);
    expect(await logo.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    expect(await logo.getAttribute("src")).toContain("snow-viking-logo");
    const logoSize = (await logo.boundingBox())!;
    expect(logoSize.width).toBe(width < 640 ? 48 : 56);
    expect(logoSize.height).toBe(logoSize.width);
    const brand = page.getByRole("navigation").locator(".ui-brand");
    await expect(page.locator(".ui-brand")).toHaveCount(1);
    await expect(brand).toHaveText("SNOW VIKING");
    await expect(brand).toHaveCSS("color", "rgb(8, 125, 137)");
    await expect(brand.locator("span")).toHaveText("V");
    await expect(brand.locator("span")).toHaveCSS("color", "rgb(185, 71, 19)");
    await expect(page.getByText("ゲレンデ選びに、今の情報を。", { exact: true })).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^ゲレンデ選びに、今の情報を。/);
    await expect(page.locator("article img, article svg")).toHaveCount(0);
    const owns = page.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
    await expect(owns.locator("dd")).toHaveText(["未取得", "未取得", "未取得"]);
    await page.screenshot({ path: test.info().outputPath("home.png") });
    await owns.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
    const postPath = (await page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false }).getAttribute("href"))!;
    await page.goto("/login?next=" + encodeURIComponent(postPath));
    await page.getByLabel("メールアドレス").fill("snow@example.test");
    await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page.getByRole("heading", { name: "スノークルーズオーンズのコンディションを投稿", exact: true })).toBeVisible();
    for (const path of [postPath, "/resort/" + encodeURIComponent("オーンズ"), "/login", "/signup", "/forgot-password", "/reset-password"]) {
      await page.goto(path);
      const main = page.getByRole("main");
      await expect(main).toBeVisible();
      await expect(page.getByRole("img", { name: "SNOW VIKING 公式マスコット", exact: true })).toBeVisible();
      await expect(page.locator(".ui-brand")).toHaveCount(1);
      await expect(page.getByText("ゲレンデ選びに、今の情報を。", { exact: true })).toHaveCount(1);
      const colors = await main.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor,
        heading: getComputedStyle(element.querySelector("h1")!).color }));
      expect(colors.background).toBe("rgb(247, 251, 252)");
      expect(colors.heading).toBe("rgb(8, 125, 137)");
      await expect(page.getByRole("navigation").getByRole("link", { name: "SNOW VIKING トップページ", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const control = main.locator(".ui-primary").first();
      if (await control.count()) expect(await control.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(185, 71, 19)");
      await page.screenshot({ path: test.info().outputPath(path.startsWith("/resort/") ? "detail.png" : path.startsWith("/post") ? "post.png" : path.slice(1) + ".png") });
    }
  });
}
