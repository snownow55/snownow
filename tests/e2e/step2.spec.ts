import { test, expect, type Page } from "@playwright/test";
import master from "../../data/resort-master.json";
import { selectRegion } from "./region-picker";
const fixture = "http://127.0.0.1:54321";
const input = { resort: "オーンズ", area: "全体", snow_type: "ザラメ", snowfall: "ほぼ無し", roughness: "きれい", crowd: "普通", comment: "頻度制限の検証" };
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill("snow@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toBeVisible();
}
test.beforeEach(async ({ request }) => { await request.post(fixture + "/__control", { data: { reset: true } }); });
for (const width of [390, 1280]) {
  test(`global hourly limit, countdown, reload and new choices at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install();
    await login(page);
    await page.goto("/post?resort=" + encodeURIComponent("オーンズ"));
    await expect(page.locator("#snow-type option")).toHaveText(["パウダー", "圧雪", "硬めの圧雪", "アイスバーン", "ザラメ", "シャバ雪・べちゃ雪", "みぞれ・雨"]);
    await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeEnabled();
    const responses = await Promise.all([input, { ...input, resort: "キロロ" }].map((data) => page.request.post("/api/posts", { data, headers: { Origin: "http://127.0.0.1:3100" } })));
    expect(responses.map((r) => r.status()).sort()).toEqual([201, 429]);
    const blocked = responses.find((r) => r.status() === 429)!;
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await blocked.json()).user_id).toBeUndefined();
    await page.goto("/post?resort=" + encodeURIComponent("キロロ"));
    await expect(page.getByRole("status").filter({ hasText: "次の投稿まであと" })).toBeVisible();
    await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeDisabled();
    const countdown = page.getByRole("status").filter({ hasText: "次の投稿まであと" });
    const previous = await countdown.textContent();
    await page.clock.fastForward(2000);
    await expect(countdown).not.toHaveText(previous!);
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: "次の投稿まであと" })).toBeVisible();
    // The UI can reach zero while another tab posts; DB/HTTP 429 remains authoritative.
    await request.post(fixture + "/__control", { data: { lastSuccess: Date.now() - 3600001 } });
    await page.reload();
    await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeEnabled();
    await request.post(fixture + "/__control", { data: { lastSuccess: Date.now() } });
    await page.getByRole("button", { name: "投稿する", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("1時間に1回");
    await expect(page.getByRole("status").filter({ hasText: "次の投稿まであと" })).toBeVisible();
  });
}
test("live master shows 63 active resorts, keeps canonical names and provisional region", async ({ page, request }) => {
  await request.post(fixture + "/__control", { data: { resorts: master.resorts.map((r, i) => ({ ...r, id: i + 100, is_active: true })) } });
  await page.goto("/?tab=live");
  for (const region of master.regions) {
    await selectRegion(page, region.name);
    const list = page.getByRole("region", { name: "スキー場一覧" });
    await expect(list.getByRole("article")).toHaveCount(master.resorts.filter((r) => r.region_code === region.code).length);
  }
  await selectRegion(page, "旭川・富良野");
  await expect(page.getByRole("article", { name: "暑寒別岳スキー場", exact: true })).toBeVisible();
  await selectRegion(page, "札幌近郊");
  await expect(page.getByRole("article", { name: "ダイナスティスキーリゾート", exact: true })).toBeVisible();
});
test("logout failure during password reset does not report successful logout", async ({ page, request }) => {
  await login(page);
  await request.post(fixture + "/__control", { data: { logoutFails: true } });
  await page.goto("/reset-password");
  await page.getByLabel("新しいパスワード", { exact: true }).fill("changed-password-123");
  await page.getByLabel("パスワード（確認）", { exact: true }).fill("changed-password-123");
  await page.getByRole("button", { name: "パスワードを変更", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("パスワードは変更済みですが、ログアウトに失敗しました");
  await expect(page.getByLabel("新しいパスワード", { exact: true })).toHaveValue("");
  await expect(page).toHaveURL(/reset-password/);
});

// This exercises only the HTTP fixture; no real signup or email is sent.
test("signup signOut failure is reported instead of claiming a confirmation result", async ({ page, request }) => {
  await request.post(fixture + "/__control", { data: { logoutFails: true, signupSession: true } });
  await page.goto("/signup");
  await page.getByLabel("メールアドレス").fill("snow@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
  await page.getByLabel("パスワード（確認）", { exact: true }).fill("fixture-password-123");
  await page.getByRole("button", { name: "新規登録", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("処理を完了できませんでした");
  await expect(page.getByRole("status").filter({ hasText: "確認メールを送信" })).toHaveCount(0);
});

test("quota refetch failure disables a previously enabled post button until retry", async ({ page, request }) => {
  await login(page);
  await page.goto("/post");
  const submit = page.getByRole("button", { name: "投稿する", exact: true });
  await expect(submit).toBeEnabled();
  await page.route("**/api/posts", async (route) => {
    if (route.request().method() === "GET") await route.fulfill({ status: 503, json: {} });
    else await route.continue();
  });
  const session = await (await request.post(fixture + "/auth/v1/token?grant_type=password", {
    data: { email: "snow@example.test", password: "fixture-password-123" },
  })).json();
  await page.evaluate((session) => {
    const channel = new BroadcastChannel("sb-127-auth-token");
    channel.postMessage({ event: "TOKEN_REFRESHED", session });
    channel.close();
  }, session);
  await expect(page.getByRole("alert").filter({ hasText: "投稿可能時刻を確認できませんでした" })).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.unroute("**/api/posts");
  await page.getByRole("button", { name: "再確認", exact: true }).click();
  await expect(submit).toBeEnabled();
});
