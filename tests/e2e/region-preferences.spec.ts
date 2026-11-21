import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const master = JSON.parse(readFileSync("data/resort-master.json", "utf8"));
master.resorts = master.resorts.map((resort: object, index: number) => ({ ...resort, id: index + 1, is_active: true }));
async function login(page: Page) {
  await page.goto("/login?next=%2Fsettings");
  await page.getByLabel("メールアドレス").fill("snow@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("heading", { name: "登録エリアの設定" })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("External request blocked");
    if (url.pathname === "/rest/v1/regions" || url.pathname === "/rest/v1/resorts") {
      await route.fulfill({ json: master[url.pathname.endsWith("regions") ? "regions" : "resorts"] });
    } else await route.continue();
  });
});
test("multiple area registration persists across contexts, both tabs group preferences first, filters still work, logout clears priority", async ({ page, context, browser }) => {
  let codes: string[] = [];
  const preferenceRoute = async (route: import("@playwright/test").Route) => {
    expect(new URL(route.request().url()).pathname).toBe("/rest/v1/user_region_preferences");
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().user_id).toBe("11111111-1111-4111-8111-111111111111");
      codes = route.request().postDataJSON().region_codes;
    }
    await route.fulfill({ json: { region_codes: codes } });
  };
  await page.route("**/rest/v1/user_region_preferences*", preferenceRoute);
  await login(page);
  await page.getByLabel("ニセコ・ルスツ", { exact: true }).check();
  await page.getByLabel("旭川・富良野", { exact: true }).check();
  await page.getByRole("button", { name: "登録エリアを保存", exact: true }).click();
  await expect(page.getByText("登録エリアを保存しました。", { exact: true })).toBeVisible();
  expect(codes).toEqual(["asahikawa-furano", "niseko-rusutsu"]);
  await page.getByRole("link", { name: "一覧に戻る" }).click();
  const sections = page.getByRole("region", { name: "スキー場一覧", exact: true }).locator(":scope > section");
  await expect(sections.first()).toHaveAttribute("aria-label", "旭川・富良野の一覧");
  await expect(sections.nth(1)).toHaveAttribute("aria-label", "ニセコ・ルスツの一覧");
  await expect(sections).toHaveCount(9);
  const morningNames = await sections.first().getByRole("article").allTextContents();
  expect(morningNames.length).toBeGreaterThan(1);
  await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
  await expect(sections.first()).toHaveAttribute("aria-label", "旭川・富良野の一覧");
  await expect(sections.nth(1)).toHaveAttribute("aria-label", "ニセコ・ルスツの一覧");
  const morningLabels = master.resorts.filter((r: { region_code: string; is_active: boolean }) => r.region_code === "asahikawa-furano" && r.is_active);
  await expect(sections.first().getByRole("article")).toHaveCount(morningLabels.length);
  await page.getByRole("combobox", { name: "地域を選択" }).selectOption("sapporo");
  await expect(sections).toHaveCount(1);
  await expect(sections.first()).toHaveAttribute("aria-label", "札幌近郊の一覧");
  // Separate browser context: same server preference, no browser-local preference state.
  const second = await browser.newContext({ storageState: await context.storageState() });
  const other = await second.newPage();
  await other.route("**/rest/v1/user_region_preferences*", preferenceRoute);
  await other.goto("/settings");
  await expect(other.getByLabel("旭川・富良野", { exact: true })).toBeChecked();
  await expect(other.getByLabel("ニセコ・ルスツ", { exact: true })).toBeChecked();
  await second.close();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(sections.first()).toHaveAttribute("aria-label", "札幌近郊の一覧");
  await expect(page.getByText("登録エリア", { exact: true })).toHaveCount(0);
});
test("failed reads and writes show an error without overwriting preferences or claiming success", async ({ page }) => {
  let failRead = true;
  await page.route("**/rest/v1/user_region_preferences*", async (route) => {
    if (route.request().method() === "POST" || failRead) await route.fulfill({ status: 403, json: { message: "denied" } });
    else await route.fulfill({ json: { region_codes: ["doto"] } });
  });
  await login(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("登録エリアを取得できませんでした");
  await expect(page.getByRole("button", { name: "登録エリアを保存", exact: true })).toHaveCount(0);
  failRead = false;
  await page.getByRole("button", { name: "再読み込み", exact: true }).click();
  await expect(page.getByLabel("道東", { exact: true })).toBeChecked();
  await page.getByLabel("道東", { exact: true }).uncheck();
  await page.getByRole("button", { name: "登録エリアを保存", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("登録エリアを保存できませんでした");
  await expect(page.getByText("登録エリアを保存しました。", { exact: true })).toHaveCount(0);
});
