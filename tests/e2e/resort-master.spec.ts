import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = "http://127.0.0.1:54321";
const areas = [
  ["sapporo", "札幌近郊", 13], ["sorachi", "空知", 6], ["asahikawa-furano", "旭川・富良野", 10],
  ["dohoku", "道北", 4], ["doo", "道央", 3], ["niseko-rusutsu", "ニセコ・ルスツ", 6],
  ["iburi", "胆振", 2], ["donan", "道南", 3], ["doto", "道東", 12],
] as const;
const manifest = readFileSync("docs/resort-master-review/59-resorts-review.csv", "utf8")
  .trim().split(/\r?\n/).slice(1).map((line) => {
    const [name, display_name, region_code, order] = line.split(",");
    return { name, display_name, region_code, sort_order: Number(order) };
  });
const body = { resort: "さっぽろばんけい", area: "山頂・上部", snow_type: "パウダー",
  snowfall: "ほぼ無し", roughness: "きれい", crowd: "空いている", condition: "★★★★★", comment: "新規スキー場の投稿" };

async function login(page: Page, next = "/post") {
  await page.goto("/login?next=" + encodeURIComponent(next));
  await page.getByLabel("メールアドレス").fill("snow@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100" + next);
}
async function post(page: Page, value: object) {
  return page.evaluate(async (payload) => (await fetch("/api/posts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  })).status, value);
}

test.beforeEach(async ({ request, page }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
  // Catch unexpected external requests from the browser as well as keeping the server on its fixture URL.
  await page.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") throw new Error("Unexpected external request in fixture test");
    await route.continue();
  });
});
test.afterEach(async ({ request }) => {
  await request.post(fixture + "/__control", { data: { reset: true } });
});

test("all nine regions show their 59 resorts in reviewed order on mobile", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByRole("region", { name: "エリア選択" });
  await expect(picker.getByRole("button")).toHaveCount(9);
  let total = 0;
  for (const [code, label, count] of areas) {
    await picker.getByRole("button", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`region=${code}$`));
    const list = page.getByRole("region", { name: "スキー場一覧" });
    const names = manifest.filter((row) => row.region_code === code).sort((a, b) => a.sort_order - b.sort_order);
    await expect(list.getByRole("link")).toHaveCount(count);
    await expect(list.locator("h3")).toHaveText(names.map((row) => row.display_name));
    expect(await list.getByRole("link").evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname)))
      .toEqual(names.map((row) => "/resort/" + encodeURIComponent(row.name)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    total += count;
  }
  expect(total).toBe(59);
  await page.reload();
  await expect(picker.getByRole("button", { name: "道東", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("existing internal URLs show display names and preserve both histories", async ({ page }) => {
  await page.goto("/resort/" + encodeURIComponent("オーンズ"));
  await expect(page.getByRole("heading", { name: "スノークルーズオーンズ", exact: true })).toBeVisible();
  await expect(page.getByText("<script>fixture</script>", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false }).click();
  await page.getByRole("main").getByRole("link", { name: "ログイン", exact: true }).click();
  await page.getByLabel("メールアドレス").fill("snow@example.test");
  await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.getByLabel("エリア", { exact: true })).toHaveValue("sapporo");
  await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue("オーンズ");
  const sent = page.waitForRequest((req) => new URL(req.url()).pathname === "/api/posts" && req.method() === "POST");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  expect((await sent).postDataJSON().resort).toBe("オーンズ");
  await expect(page).toHaveURL(/\/\?region=sapporo$/);
  await page.goto("/resort/" + encodeURIComponent("キロロ"));
  await expect(page.getByRole("heading", { name: "キロロ", exact: true })).toBeVisible();
  await expect(page.getByText("キロロの既存投稿", { exact: false })).toBeVisible();
});

test("detail preselection survives login for names with apostrophes and spaces", async ({ page }) => {
  for (const name of ["Fu'sスノーエリア", "国設阿寒湖畔スキー場 ウタラ"]) {
    await page.goto("/resort/" + encodeURIComponent(name));
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false }).click();
    if (name.startsWith("Fu")) {
      await page.getByRole("main").getByRole("link", { name: "ログイン", exact: true }).click();
      await page.getByLabel("メールアドレス").fill("snow@example.test");
      await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
      await page.getByRole("button", { name: "ログイン", exact: true }).click();
    }
    await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue(name);
    await expect(page.getByLabel("エリア", { exact: true })).toHaveValue(name.startsWith("Fu") ? "sapporo" : "doto");
  }
});

test("dependent region selection clears the old resort and submits exactly eight original fields", async ({ page }) => {
  await login(page, "/post?resort=" + encodeURIComponent("キロロ"));
  await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue("キロロ");
  await page.locator("textarea").fill("エリアを切り替えても入力を保持");
  await page.getByLabel("エリア", { exact: true }).selectOption("doto");
  await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue("えんがるロックバレー");
  await expect(page.getByLabel("スキー場", { exact: true }).locator("option[value='キロロ']")).toHaveCount(0);
  await page.getByLabel("スキー場", { exact: true }).selectOption("国設阿寒湖畔スキー場 ウタラ");
  await page.getByLabel("ゲレンデ内の位置", { exact: true }).selectOption("中腹");
  const sent = page.waitForRequest((req) => new URL(req.url()).pathname === "/api/posts" && req.method() === "POST");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  const payload = (await sent).postDataJSON();
  expect(Object.keys(payload).sort()).toEqual(Object.keys(body).sort());
  expect(payload.resort).toBe("国設阿寒湖畔スキー場 ウタラ");
  expect(payload.area).toBe("中腹");
  expect(payload.snowfall).toBe("ほぼ無し");
  expect(payload.comment).toBe("エリアを切り替えても入力を保持");
  await expect(page).toHaveURL(/\/\?region=doto$/);
  await page.goto("/resort/" + encodeURIComponent(payload.resort));
  await expect(page.getByText("中腹", { exact: true })).toBeVisible();
});

test("API allows new active masters and rejects unknown, display-only, inactive, and tampered names", async ({ page, request }) => {
  await login(page);
  await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeEnabled();
  expect(await post(page, body)).toBe(201);
  for (const name of ["未登録スキー場", "スノークルーズオーンズ"]) expect(await post(page, { ...body, resort: name })).toBe(400);
  expect(await post(page, { ...body, user_id: "other-user" })).toBe(400);
  expect(await post(page, { ...body, region_code: "sapporo" })).toBe(400);
  await request.post(fixture + "/__control", { data: { inactive: [body.resort] } });
  expect(await post(page, body)).toBe(400);
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(1);
});

test("inactive resorts retain readable history but cannot be selected or posted", async ({ page, request }) => {
  await request.post(fixture + "/__control", { data: { inactive: ["オーンズ"] } });
  await page.goto("/resort/" + encodeURIComponent("オーンズ"));
  await expect(page.getByText("<script>fixture</script>", { exact: false })).toBeVisible();
  await expect(page.getByText("現在はこのスキー場への投稿を受け付けていません。", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false })).toHaveCount(0);
  await login(page, "/post?resort=" + encodeURIComponent("オーンズ"));
  await expect(page.getByText("指定されたエリア・スキー場は投稿対象として選択できません。選び直してください。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeDisabled();
});

test("unknown and conflicting URLs never silently select another resort", async ({ page }) => {
  await page.goto("/resort/" + encodeURIComponent("未登録スキー場"));
  await expect(page.getByRole("heading", { name: "指定されたスキー場が見つかりません" })).toBeVisible();
  await login(page);
  for (const path of ["/post?resort=未登録スキー場", "/post?region=unknown", "/post?region=doto&resort=キロロ"]) {
    await page.goto(path);
    await expect(page.getByText("指定されたエリア・スキー場は投稿対象として選択できません。選び直してください。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeDisabled();
  }
  await page.getByLabel("エリア", { exact: true }).selectOption("sapporo");
  await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeEnabled();
  await page.goto("/?region=unknown");
  await expect(page.getByText("指定されたエリアが見つかりません。エリアを選び直してください。", { exact: true })).toBeVisible();
});

test("master failures block the form and API without inserting; retry restores the UI", async ({ page, request }) => {
  await login(page);
  for (const table of ["regions", "resorts"]) {
    await request.post(fixture + "/__control", { data: { failTables: [table] } });
    for (const path of ["/", "/post", "/resort/" + encodeURIComponent("オーンズ")]) {
      await page.goto(path);
      await expect(page.getByText("エリア・スキー場の情報を取得できませんでした。もう一度お試しください。", { exact: true })).toBeVisible();
      if (path === "/post") await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeDisabled();
    }
    if (table === "resorts") expect(await post(page, body)).toBe(503);
    await request.post(fixture + "/__control", { data: { failTables: [] } });
    await page.getByRole("button", { name: "再読み込み", exact: true }).click();
    await expect(page.getByRole("heading", { name: "スノークルーズオーンズ", exact: true })).toBeVisible();
  }
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
});

test("post read failures are not displayed as empty histories", async ({ page, request }) => {
  await request.post(fixture + "/__control", { data: { failTables: ["snow_posts"] } });
  for (const path of ["/", "/resort/" + encodeURIComponent("オーンズ")]) {
    await page.goto(path);
    await expect(page.getByText("投稿情報を取得できませんでした。", { exact: true })).toBeVisible();
    await expect(page.getByText("まだ投稿がありません", { exact: true })).toHaveCount(0);
    await expect(page.getByText("まだ現地速報がありません", { exact: true })).toHaveCount(0);
  }
});

test("null post responses are errors rather than empty histories", async ({ page }) => {
  await page.route(fixture + "/rest/v1/snow_posts?**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: "null",
  }));
  for (const path of ["/", "/resort/" + encodeURIComponent("オーンズ")]) {
    await page.goto(path);
    await expect(page.getByText("投稿情報を取得できませんでした。", { exact: true })).toBeVisible();
    await expect(page.getByText("まだ投稿がありません", { exact: true })).toHaveCount(0);
    await expect(page.getByText("まだ現地速報がありません", { exact: true })).toHaveCount(0);
  }
});

test("posting after visiting the list and detail refreshes both histories", async ({ page }) => {
  await login(page, "/?region=sapporo");
  const card = page.getByRole("region", { name: "スキー場一覧" }).getByRole("link", { name: /スノークルーズオーンズ/ });
  await expect(card).toContainText("最新投稿 1件");
  await card.click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false }).click();
  await page.getByLabel("営業開始後の積雪", { exact: true }).selectOption("そこそこ積もった");
  await page.locator("textarea").fill("一覧から投稿後の再表示");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  await expect(page).toHaveURL(/\/\?region=sapporo$/);
  await expect(card).toContainText("最新投稿 2件");
  await expect(card).toContainText("そこそこ積もった");
  await card.click();
  await expect(page.locator("article")).toHaveCount(2);
  await expect(page.getByText("一覧から投稿後の再表示", { exact: false })).toBeVisible();
});

test("API requires the JSON media type and rejects oversized UTF-8 bodies", async ({ page, request }) => {
  await login(page);
  const statuses = await page.evaluate(async (payload) => {
    const send = async (contentType: string, value: string | Uint8Array<ArrayBuffer>) => (await fetch("/api/posts", {
      method: "POST", headers: { "Content-Type": contentType }, body: value,
    })).status;
    const json = JSON.stringify(payload);
    const atLimit = json + " ".repeat(16000 - new TextEncoder().encode(json).byteLength);
    return [await send("application/jsonp", json),
      await send("application/json; charset=utf-8", JSON.stringify({ ...payload, comment: "雪".repeat(6000) })),
      await send("application/json", atLimit + " "),
      await send("application/json", new Uint8Array([123, 255, 125])),
      await send("application/json", "{"),
      await send("application/json; charset=utf-8", atLimit)];
  }, body);
  expect(statuses).toEqual([415, 413, 413, 400, 400, 201]);
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(1);
});

test("a master read failure after form load is refused by the API and preserves the input", async ({ page, request }) => {
  await login(page, "/post?resort=" + encodeURIComponent("キロロ"));
  await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeEnabled();
  await page.locator("textarea").fill("通信失敗でも残す入力");
  await request.post(fixture + "/__control", { data: { failTables: ["resorts"] } });
  const response = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/posts");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("投稿に失敗しました。");
  await expect(page.locator("textarea")).toHaveValue("通信失敗でも残す入力");
  await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue("キロロ");
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
});
