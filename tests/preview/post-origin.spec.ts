import { test, expect } from "@playwright/test";

const fixture = "http://127.0.0.1:54321";
const deployment = "https://snow-viking-deployment-fixture.vercel.app";
const branch = "https://snow-viking-git-auth-fixture.vercel.app";
const next = "/post?" + new URLSearchParams({ region: "asahikawa-furano", resort: "ほろたちスキー場", from: "detail" });
const body = { resort: "ほろたちスキー場", area: "山頂・上部", snow_type: "パウダー", snowfall: "ほぼ無し",
  roughness: "きれい", crowd: "空いている", condition: null, comment: "Previewの投稿確認" };

test.beforeEach(async ({ page, request }) => {
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
  test(`verified Preview posting and distinct error messages work at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/login?next=" + encodeURIComponent(next));
    await page.getByLabel("メールアドレス").fill("snow@example.test");
    await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ほろたちスキー場のコンディションを投稿", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation")).toContainText("ログイン中");
    await page.getByLabel("現地コメント", { exact: true }).fill(body.comment);

    for (const origin of ["https://unrelated-project.vercel.app", "https://evil.test", "null", ""]) {
      const response = await page.request.post("/api/posts", { headers: origin ? { origin } : {}, data: body });
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ error: "Forbidden" });
    }
    expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);

    let failure: { status: number; body: string } | null = null;
    let allowedOrigin = deployment;
    await page.route("**/api/posts", async (route) => {
      if (failure) await route.fulfill({ status: failure.status, contentType: "application/json", body: failure.body });
      else await route.continue({ headers: { ...await route.request().allHeaders(), origin: allowedOrigin } });
    });
    for (const [status, response, message] of [
      [403, JSON.stringify({ error: "Forbidden" }), "このページのURLからは投稿を受け付けられません。正規のサイトから開き直してください。"],
      [401, JSON.stringify({ error: "Authentication required" }), "ログイン状態を確認できません。もう一度ログインしてください。"],
      [403, JSON.stringify({ error: "Email verification required" }), "メール確認済みのアカウントでログインしてください。匿名アカウントでは投稿できません。"],
      [403, "<html>proxy refusal</html>", "投稿が許可されませんでした。アクセス条件を確認してください。"],
    ] as const) {
      failure = { status, body: response };
      await page.getByRole("button", { name: "投稿する", exact: true }).click();
      await expect(page.locator("p[role=alert]")).toHaveText(message);
      await expect(page.getByLabel("現地コメント", { exact: true })).toHaveValue(body.comment);
      await expect(page.getByRole("navigation")).toContainText("ログイン中");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath("post-error.png") });

    failure = null;
    for (const origin of [deployment, branch]) {
      allowedOrigin = origin;
      const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/posts");
      await page.getByRole("button", { name: "投稿する", exact: true }).click();
      expect((await response).status()).toBe(201);
      await expect(page).toHaveURL(/\/?\?region=asahikawa-furano$/);
      await page.goto(next);
      await expect(page.getByRole("heading", { name: "ほろたちスキー場のコンディションを投稿", exact: true })).toBeVisible();
    }
    const stats = await (await request.get(fixture + "/__stats")).json();
    expect(stats.inserts).toBe(2);
    expect(stats.lastInsert.resort).toBe(body.resort);
    expect(stats.lastInsert.condition).toBeNull();
    expect(stats.posts.slice(0, 2).map((post: { resort: string }) => post.resort)).toEqual(["オーンズ", "キロロ"]);
  });
}
