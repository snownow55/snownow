import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, email = "snow@example.test", next = "/") {
  await page.goto("/login?next=" + encodeURIComponent(next));
  await page.getByLabel("メールアドレス").fill(email);
  await page
    .getByLabel("パスワード", { exact: true })
    .fill("fixture-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
}
test("public list and resort preserve display; unsigned users cannot post", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今日、どこが滑れる？" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /オーンズ/ }).click();
  await expect(
    page.getByText("<script>fixture</script>", { exact: false }),
  ).toBeVisible();
  await page.goto("/post");
  await expect(
    page.getByRole("heading", { name: "投稿にはログインが必要です" }),
  ).toBeVisible();
  const response = await request.post("/api/posts", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {},
  });
  expect(response.status()).toBe(401);
});
test("registration, confirmation resend and verified email callback", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("メールアドレス").fill("snow@example.test");
  const password = page.getByLabel("パスワード", { exact: true });
  const confirmation = page.getByLabel("パスワード（確認）");
  const submit = page.getByRole("button", { name: "新規登録", exact: true });
  let signupRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/auth/v1/signup") signupRequests++;
  });
  await expect(password).toHaveAttribute("minlength", "8");
  await expect(page.getByText("8文字以上で入力してください。", { exact: true })).toBeVisible();
  await password.fill("Abcd123");
  await confirmation.fill("Abcd123");
  await submit.click();
  expect(await password.evaluate((input: HTMLInputElement) => input.validity.tooShort)).toBe(true);
  expect(signupRequests).toBe(0);
  // The submit handler must also reject short passwords if native validation is bypassed.
  await page.locator("form").evaluate((form: HTMLFormElement) => { form.noValidate = true; });
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "パスワードは8文字以上で入力してください。" })).toHaveText("パスワードは8文字以上で入力してください。");
  expect(signupRequests).toBe(0);
  await password.fill("Abcd1234");
  await confirmation.fill("Abcd1234");
  const [signupRequest] = await Promise.all([
    page.waitForRequest((request) => new URL(request.url()).pathname === "/auth/v1/signup"),
    submit.click(),
  ]);
  expect(signupRequest.postDataJSON().password).toBe("Abcd1234");
  await expect(
    page.getByRole("status").filter({ hasText: "確認メールを送信" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "確認メールを再送" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "再送可能" }),
  ).toBeVisible();
  await page.goto(
    "/auth/callback?token_hash=valid-fixture-token&type=signup&next=https://evil.test",
  );
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
});
test("login preserves selected resort and verified user can submit; logout removes access", async ({
  page,
}) => {
  await login(page, "snow@example.test", "/post?resort=キロロ");
  await expect(
    page.getByRole("heading", { name: "コンディションを投稿" }),
  ).toBeVisible();
  await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue("キロロ");
  await expect(page.getByText("営業開始後の降雪", { exact: true })).toBeVisible();
  await expect(page.getByText("営業時間後の積雪", { exact: true })).toHaveCount(0);
  await expect(page.getByText("営業開始後の積雪", { exact: true })).toHaveCount(0);
  expect(await page.getByLabel("営業開始後の降雪", { exact: true }).locator("option").evaluateAll(
    (options) => options.map((option) => (option as HTMLOptionElement).value),
  )).toEqual(["ほぼ無し", "うっすら積もった", "そこそこ積もった", "かなり積もった", "分からない"]);
  const postRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/api/posts" && request.method() === "POST",
  );
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  expect((await postRequest).postDataJSON().snowfall).toBe("ほぼ無し");
  await expect(page).toHaveURL("http://127.0.0.1:3100/?region=sapporo");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "ログイン" }),
  ).toBeVisible();
  await page.goto("/post");
  await expect(
    page.getByRole("heading", { name: "投稿にはログインが必要です" }),
  ).toBeVisible();
});
test("unconfirmed and anonymous users are rejected by server, even with a session", async ({
  page,
}) => {
  for (const email of ["unconfirmed@example.test", "anonymous@example.test"]) {
    await login(page, email, "/post");
    await expect(
      page.getByRole("heading", { name: "投稿にはログインが必要です" }),
    ).toBeVisible();
    const status = await page.evaluate(
      async () =>
        (
          await fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
    );
    expect(status).toBe(403);
    await page.getByRole("button", { name: "ログアウト" }).click();
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "ログイン" }),
    ).toBeVisible();
  }
});
test("password recovery, update and invalid callback handling", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("メールアドレス").fill("snow@example.test");
  await page.getByRole("button", { name: "再設定メールを送信" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "登録済み" }),
  ).toBeVisible();
  await page.goto(
    "/auth/callback?token_hash=valid-fixture-token&type=recovery&next=//evil.test",
  );
  await expect(page).toHaveURL(/\/reset-password$/);
  const password = page.getByLabel("新しいパスワード", { exact: true });
  await expect(password).toHaveAttribute("minlength", "8");
  await expect(page.getByText("8文字以上で入力してください。", { exact: true })).toBeVisible();
  await password.fill("Abcd123");
  await page.getByLabel("パスワード（確認）").fill("Abcd123");
  await page.getByRole("button", { name: "パスワードを変更" }).click();
  expect(await password.evaluate((input: HTMLInputElement) => input.validity.tooShort)).toBe(true);
  await page.locator("form").evaluate((form: HTMLFormElement) => { form.noValidate = true; });
  await page.getByRole("button", { name: "パスワードを変更" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "パスワードは8文字以上で入力してください。" })).toHaveText("パスワードは8文字以上で入力してください。");
  await password.fill("Abcd1234");
  await page.getByLabel("パスワード（確認）").fill("Abcd1234");
  const updateRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname === "/auth/v1/user" && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "パスワードを変更" }).click();
  expect((await updateRequest).postDataJSON().password).toBe("Abcd1234");
  await expect(page).toHaveURL(/\/login\?notice=password-updated$/);
  await page.goto("/auth/callback?token_hash=expired&type=signup");
  await expect(
    page.getByRole("alert").filter({ hasText: "認証リンクが無効" }),
  ).toBeVisible();
});
test("cross-origin and invalid posts are rejected; mobile forms fit screen", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/posts", {
        headers: { origin: "https://evil.test" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await login(page);
  const status = await page.evaluate(
    async () =>
      (
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: "someone-else" }),
        })
      ).status,
  );
  expect(status).toBe(400);
  for (const route of [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/post",
  ]) {
    await page.goto(route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test('PKCE code confirmation stays on site and invalid credentials do not log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill('snow@example.test');
  await page.getByLabel('パスワード', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'ログインできませんでした' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ログアウト' })).toHaveCount(0);
  await page.goto('/signup');
  await page.getByLabel('メールアドレス').fill('snow@example.test');
  await page.getByLabel('パスワード', { exact: true }).fill('fixture-password-123');
  await page.getByLabel('パスワード（確認）').fill('fixture-password-123');
  await page.getByRole('button', { name: '新規登録', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '確認メールを送信' })).toBeVisible();
  await page.goto('/auth/callback?code=valid-fixture-code&next=//evil.test');
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible();
});
