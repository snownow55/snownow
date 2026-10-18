import { selectRegion } from "./region-picker";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { KANA_ORDER } from "../resort-order.fixture";

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
  snowfall: "ほぼ無し", roughness: "きれい", crowd: "空いている", condition: null, comment: "新規スキー場の投稿" };

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

async function expectFixedForm(page: Page, displayName: string) {
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: `${displayName}のコンディションを投稿`, exact: true })).toBeVisible();
  await expect(main.getByLabel("エリア", { exact: true })).toHaveCount(0);
  await expect(main.getByLabel("スキー場", { exact: true })).toHaveCount(0);
  await expect(main.locator("select")).toHaveCount(5);
  await expect(main.locator("#condition")).toHaveCount(0);
  await expect(main.getByText(/[★☆]/)).toHaveCount(0);
  await expect(main.locator("select").first()).toHaveAttribute("id", "slope-area");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test("all nine regions show their 59 resorts in kana order on mobile", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByRole("region", { name: "エリア選択" });
  await expect(picker.getByRole("combobox")).toBeVisible();
  await expect(picker.locator("option")).toHaveCount(9);
  await expect(picker.getByRole("button")).toHaveCount(0);
  let total = 0;
  for (const [code, label, count] of areas) {
    await selectRegion(page, label);
    await expect.poll(() => new URL(page.url()).searchParams.get("region")).toBe(code);
    const list = page.getByRole("region", { name: "スキー場一覧" });
    const names = KANA_ORDER[code].map((name) => manifest.find((row) => row.name === name)!);
    await expect(list.getByRole("article")).toHaveCount(count);
    await expect(list.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true })).toHaveCount(count);
    await expect(list.getByRole("link", { name: "投稿する", exact: true })).toHaveCount(0);
    await expect(list.locator("h3")).toHaveText(names.map((row) => row.display_name));
    expect(await list.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname)))
      .toEqual(names.map((row) => "/resort/" + encodeURIComponent(row.name)));
    for (const tab of ["ゲレンデの今", "朝のコンディション"]) {
      await page.getByRole("tab", { name: tab, exact: false }).click();
      await expect(page.getByRole("tab", { name: tab, exact: false })).toHaveAttribute("aria-selected", "true");
      await expect(list.locator("h3")).toHaveText(names.map((row) => row.display_name));
      await expect(list.getByRole("link")).toHaveCount(tab === "ゲレンデの今" ? count * 2 : count);
      await expect(list.getByRole("link", { name: "投稿する", exact: true })).toHaveCount(tab === "ゲレンデの今" ? count : 0);
      if (tab === "ゲレンデの今") {
        expect(await list.getByRole("link", { name: "投稿する", exact: true }).evaluateAll((links) => links.map((link) => {
          const url = new URL((link as HTMLAnchorElement).href);
          return { path: url.pathname, name: url.searchParams.get("resort"), region: url.searchParams.get("region"), mode: url.searchParams.get("from") };
        }))).toEqual(names.map((row) => ({ path: "/post", name: row.name, region: code, mode: "detail" })));
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    total += count;
  }
  expect(total).toBe(59);
  await page.reload();
  await expect(picker.getByRole("combobox")).toHaveValue("doto");
});

test("morning cards have one canonical detail link and retain downstream posting", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
  await expect(card.locator("dd")).toHaveText(["未取得", "未取得", "未取得", "未取得"]);
  await expect(card.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
  await expect(card.locator("time, script")).toHaveCount(0);
  await card.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "スノークルーズオーンズ", level: 1, exact: true })).toBeVisible();
  await expect(page.locator("article").getByText("営業開始後の降雪", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText(/[★☆]/)).toHaveCount(0);
  const link = page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false });
  const target = new URL((await link.getAttribute("href"))!, page.url());
  expect(target.searchParams.get("resort")).toBe("オーンズ");
  expect(target.searchParams.get("from")).toBe("detail");
});

test("region to detail to fixed form submits the selected resort with a null rating", async ({ page }) => {
  await login(page, "/");
  await selectRegion(page, "旭川・富良野");
  await page.getByRole("region", { name: "スキー場一覧" }).getByRole("article", { name: "カムイスキーリンクス", exact: true }).getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
  await expect(page.getByText("まだ投稿がありません", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false }).click();
  await expectFixedForm(page, "カムイスキーリンクス");
  await page.getByLabel("ゲレンデ内の位置", { exact: true }).selectOption("中腹");
  await page.getByLabel("雪質", { exact: true }).selectOption("圧雪");
  await page.getByLabel("営業開始後の降雪", { exact: true }).selectOption("うっすら積もった");
  await page.getByLabel("ゲレンデの荒れ具合", { exact: true }).selectOption("少し荒れている");
  await page.getByLabel("混雑", { exact: true }).selectOption("普通");
  await page.getByLabel("現地コメント", { exact: true }).fill("投稿先を固定したフォームの確認");
  const sent = page.waitForRequest((req) => new URL(req.url()).pathname === "/api/posts" && req.method() === "POST");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({ resort: "カムイスキーリンクス", area: "中腹", snow_type: "圧雪",
    snowfall: "うっすら積もった", roughness: "少し荒れている", crowd: "普通", condition: null,
    comment: "投稿先を固定したフォームの確認" });
  await expect(page).toHaveURL(/\/\?region=asahikawa-furano$/);
  const card = page.getByRole("region", { name: "スキー場一覧" }).getByRole("article", { name: "カムイスキーリンクス", exact: true });
  await expect(card.locator("dd")).toHaveText(["未取得", "未取得", "未取得", "未取得"]);
  await card.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
  await expect(page.getByText("投稿先を固定したフォームの確認", { exact: false })).toBeVisible();
});

test("direct post access retains both selectors after changing region and resort", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "コンディションを投稿", exact: true })).toBeVisible();
  await expect(page.getByLabel("エリア", { exact: true })).toHaveValue("sapporo");
  await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue("さっぽろばんけい");
  await page.getByLabel("現地コメント", { exact: true }).fill("直接アクセスの入力保持");
  await page.getByLabel("エリア", { exact: true }).selectOption("asahikawa-furano");
  await page.getByLabel("スキー場", { exact: true }).selectOption("カムイスキーリンクス");
  await expect(page.getByRole("main").locator("select")).toHaveCount(7);
  await expect(page.getByLabel("エリア", { exact: true })).toHaveValue("asahikawa-furano");
  await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue("カムイスキーリンクス");
  await expect(page.getByLabel("現地コメント", { exact: true })).toHaveValue("直接アクセスの入力保持");
  expect(new URL(page.url()).searchParams.has("from")).toBe(false);
  const sent = page.waitForRequest((req) => new URL(req.url()).pathname === "/api/posts" && req.method() === "POST");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  expect((await sent).postDataJSON()).toEqual({ ...body, resort: "カムイスキーリンクス", comment: "直接アクセスの入力保持" });
  await expect(page).toHaveURL(/\/\?region=asahikawa-furano$/);
});

test("invalid fixed targets never fall back to a default resort and can be reselected", async ({ page, request }) => {
  await login(page);
  await request.post(fixture + "/__control", { data: { inactive: ["オーンズ"] } });
  for (const query of ["", "resort=", "resort=未登録スキー場", "resort=スノークルーズオーンズ", "resort=オーンズ", "region=doto&resort=キロロ"]) {
    await page.goto("/post?from=detail&" + query);
    await expect(page.getByText("指定されたエリア・スキー場は投稿対象として選択できません。選び直してください。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeDisabled();
    await expect(page.getByLabel("エリア", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("スキー場", { exact: true })).toHaveCount(0);
  }
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
  await page.getByRole("link", { name: "投稿先を選び直す", exact: true }).click();
  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByLabel("スキー場", { exact: true })).toHaveValue("さっぽろばんけい");
  await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeEnabled();
});

test("empty invalid selections remain blocked after login in both form modes", async ({ page, request }) => {
  for (const path of ["/post?resort=", "/post?region=", "/post?from=detail&resort=", "/post?from=detail&region=&resort=キロロ"]) {
    await page.goto(path);
    await page.getByRole("main").getByRole("link", { name: "ログイン", exact: true }).click();
    await page.getByLabel("メールアドレス").fill("snow@example.test");
    await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page.getByText("指定されたエリア・スキー場は投稿対象として選択できません。選び直してください。", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeDisabled();
    const params = new URL(page.url()).searchParams;
    for (const [key, value] of new URL(path, page.url()).searchParams) expect(params.get(key)).toBe(value);
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page.getByRole("navigation").getByRole("link", { name: "ログイン", exact: true })).toBeVisible();
  }
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
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
  await expectFixedForm(page, "スノークルーズオーンズ");
  expect(new URL(page.url()).searchParams.get("from")).toBe("detail");
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
    await expectFixedForm(page, name);
    const params = new URL(page.url()).searchParams;
    expect(params.get("resort")).toBe(name);
    expect(params.get("region")).toBe(name.startsWith("Fu") ? "sapporo" : "doto");
    expect(params.get("from")).toBe("detail");
  }
});

test("dependent region selection clears the old resort and preserves the other fields", async ({ page }) => {
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
    for (const path of ["/", "/post", "/post?from=detail&resort=" + encodeURIComponent("オーンズ"), "/resort/" + encodeURIComponent("オーンズ")]) {
      await page.goto(path);
      await expect(page.getByText("エリア・スキー場の情報を取得できませんでした。もう一度お試しください。", { exact: true })).toBeVisible();
      if (path.startsWith("/post")) await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeDisabled();
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
    await expect(page.getByText("現地投稿なし", { exact: true })).toHaveCount(0);
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
    await expect(page.getByText("現地投稿なし", { exact: true })).toHaveCount(0);
  }
});

test("posting after visiting the list and detail refreshes both histories", async ({ page }) => {
  await login(page, "/?region=sapporo");
  const card = page.getByRole("region", { name: "スキー場一覧" }).getByRole("article", { name: "スノークルーズオーンズ", exact: true });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "このスキー場の情報を投稿", exact: false }).click();
  await page.getByLabel("営業開始後の降雪", { exact: true }).selectOption("そこそこ積もった");
  await page.locator("textarea").fill("一覧から投稿後の再表示");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  await expect(page).toHaveURL(/\/\?region=sapporo$/);
  await expect(card.locator("dd")).toHaveText(["未取得", "未取得", "未取得", "未取得"]);
  await card.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
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
  await login(page, "/post?from=detail&resort=" + encodeURIComponent("キロロ"));
  await expect(page.getByRole("button", { name: "投稿する", exact: true })).toBeEnabled();
  await page.locator("textarea").fill("通信失敗でも残す入力");
  await request.post(fixture + "/__control", { data: { failTables: ["resorts"] } });
  const response = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/posts");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("投稿に失敗しました。");
  await expect(page.locator("textarea")).toHaveValue("通信失敗でも残す入力");
  await expectFixedForm(page, "キロロ");
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
});

for (const [name, displayName, region, label] of [
  ["オーンズ", "スノークルーズオーンズ", "sapporo", "札幌近郊"],
  ["カムイスキーリンクス", "カムイスキーリンクス", "asahikawa-furano", "旭川・富良野"],
]) {
  test(`top posting link for ${name} survives login and saves null without changing old ratings`, async ({ page, request }) => {
    const before = await (await request.get(fixture + "/__stats")).json();
    await page.goto("/");
    await selectRegion(page, label);
    const card = page.getByRole("article", { name: displayName, exact: true });
    await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
    await expect(card.getByRole("link", { name: "詳細を見る", exact: true })).toBeVisible();
    await card.getByRole("link", { name: "投稿する", exact: true }).click();
    await expect(page.getByRole("heading", { name: "投稿にはログインが必要です", exact: true })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "ログイン", exact: true }).click();
    await page.getByLabel("メールアドレス").fill("snow@example.test");
    await page.getByLabel("パスワード", { exact: true }).fill("fixture-password-123");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expectFixedForm(page, displayName);
    await page.getByLabel("現地コメント", { exact: true }).fill("星なしの新規投稿");
    await page.getByRole("button", { name: "投稿する", exact: true }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:3100/?region=${region}`);
    await expect(card.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
    const after = await (await request.get(fixture + "/__stats")).json();
    expect(after.inserts).toBe(1);
    expect(after.lastInsert.resort).toBe(name);
    expect(after.lastInsert.condition).toBeNull();
    expect(after.posts.slice(0, 2)).toEqual(before.posts);
    await card.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
    await expect(page.getByRole("heading", { name: displayName, level: 1, exact: true })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(name === "オーンズ" ? 2 : 1);
    await expect(page.getByText("星なしの新規投稿", { exact: false })).toBeVisible();
    await expect(page.getByRole("main").getByText(/[★☆]/)).toHaveCount(0);
  });
}

test("API normalizes an omitted rating to null and refuses non-null ratings without inserts", async ({ page, request }) => {
  await login(page);
  const withoutRating = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "condition"));
  expect(await post(page, withoutRating)).toBe(201);
  const stats = await (await request.get(fixture + "/__stats")).json();
  expect(stats.lastInsert.condition).toBeNull();
  for (const rating of ["★★★★★", "", 1, false, {}]) {
    expect(await post(page, { ...body, condition: rating })).toBe(400);
  }
  expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(1);
});

test("latest order survives region changes and preserves per-resort cards beyond the global 1000-row limit", async ({ page, request }) => {
  const many = Array.from({ length: 1201 }, (_, index) => ({ ...body, resort: "オーンズ", id: index + 1,
    comment: `オーンズの投稿${index + 1}`, created_at: "2026-10-11T00:00:00.000001Z" }));
  const rows = [...many,
    { ...body, resort: "キロロ", id: 1202, comment: "キロロの最新コメント", created_at: "2025-10-11T00:00:00Z" },
    { ...body, resort: "朝里川温泉スキー場", id: 1203, comment: "朝里川の最新コメント", created_at: "2025-10-11T00:00:00Z" }];
  await request.post(fixture + "/__control", { data: { posts: rows } });
  await page.goto("/");
  await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
  const latest = page.getByRole("button", { name: "最新投稿順", exact: true });
  const kana = page.getByRole("button", { name: "五十音順", exact: true });
  const list = page.getByRole("region", { name: "スキー場一覧" });
  await expect(kana).toHaveAttribute("aria-pressed", "true");
  await expect(latest).toBeEnabled();
  const headings = (names: readonly string[]) => names.map((name) => manifest.find((r) => r.name === name)!.display_name);
  await expect(list.locator("h3")).toHaveText(headings(KANA_ORDER.sapporo));
  await latest.click();
  await expect(latest).toHaveAttribute("aria-pressed", "true");
  const posted = ["オーンズ", "朝里川温泉スキー場", "キロロ"];
  const expected = [...posted, ...KANA_ORDER.sapporo.filter((name) => !posted.includes(name))];
  await expect(list.locator("h3")).toHaveText(headings(expected));
  const owns = list.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
  await expect(owns.getByLabel("投稿状況", { exact: true })).toContainText("最新投稿あり");
  await expect(owns.locator("time")).toHaveAttribute("datetime", "2026-10-11T00:00:00.000001Z");
  const kiroro = list.getByRole("article", { name: "キロロ", exact: true });
  await expect(kiroro.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
  expect(new URL((await kiroro.getByRole("link", { name: "詳細を見る", exact: true }).getAttribute("href"))!, page.url()).pathname).toBe("/resort/" + encodeURIComponent("キロロ"));
  await selectRegion(page, "空知");
  await expect(latest).toHaveAttribute("aria-pressed", "true");
  await expect(latest).toBeEnabled();
  await expect(list.locator("h3")).toHaveText(headings(KANA_ORDER.sorachi));
  await expect(list.getByLabel("投稿状況", { exact: true })).toHaveText(Array(6).fill("投稿なし"));
  await selectRegion(page, "道東");
  await selectRegion(page, "札幌近郊");
  await expect(latest).toHaveAttribute("aria-pressed", "true");
  await expect(list.locator("h3")).toHaveText(headings(expected));
  await kana.click();
  await expect(list.locator("h3")).toHaveText(headings(KANA_ORDER.sapporo));
  await expect(kiroro.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const stats = await (await request.get(fixture + "/__stats")).json();
  expect(stats.inserts).toBe(0);
  expect(stats.posts).toEqual(rows);
});

test("latest sorting uses microsecond precision and the card stays linked to that resort", async ({ page, request }) => {
  await request.post(fixture + "/__control", { data: { posts: [
    { ...body, id: 1, resort: "キロロ", comment: "キロロの雪", created_at: "2026-10-11T00:00:00.000001Z" },
    { ...body, id: 2, resort: "オーンズ", comment: "オーンズの雪", created_at: "2026-10-11T09:00:00.000002+09:00" },
  ] } });
  await page.goto("/");
  await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
  await page.getByRole("button", { name: "最新投稿順", exact: true }).click();
  const cards = page.getByRole("region", { name: "スキー場一覧" }).getByRole("article");
  await expect(cards.first().getByRole("heading", { level: 3 })).toHaveText("スノークルーズオーンズ");
  await expect(cards.nth(1).getByRole("heading", { level: 3 })).toHaveText("キロロ");
  await expect(cards.first().getByLabel("現地コメント", { exact: true })).toHaveCount(0);
  await cards.first().getByRole("link", { name: "詳細を見る", exact: true }).click();
  await expect(page.getByRole("heading", { name: "スノークルーズオーンズ", level: 1, exact: true })).toBeVisible();
  await expect(page.locator("article")).toContainText("オーンズの雪");
});

test("a partial resort post read failure prevents misleading latest rankings and partial cards", async ({ page }) => {
  let failKiroro = false;
  await page.route(fixture + "/rest/v1/snow_posts?**", async (route) => {
    if (failKiroro && new URL(route.request().url()).searchParams.get("resort") === "eq.キロロ") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "fixture failure" }) });
    } else await route.continue();
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
  await page.getByRole("button", { name: "最新投稿順", exact: true }).click();
  failKiroro = true;
  await selectRegion(page, "空知");
  await expect(page.getByRole("heading", { name: "空知のスキー場", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toBeEnabled();
  await selectRegion(page, "札幌近郊");
  await expect(page.getByText("投稿情報を取得できませんでした。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "最新投稿順", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("最新投稿順を取得できないため、五十音順で表示しています。", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "スキー場一覧" }).getByLabel("現地コメント", { exact: true })).toHaveCount(0);
  await expect(page.getByText("現地投稿なし", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "投稿する", exact: true })).toHaveCount(13);
  await expect(page.getByRole("link", { name: "詳細を見る", exact: true })).toHaveCount(13);
});

for (const width of [320, 390, 1280]) {
  test(`compact light cards keep existing links and fit a ${width}px viewport`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const list = page.getByRole("region", { name: "スキー場一覧" });
    await expect(list.getByRole("article")).toHaveCount(13);
    await expect(page.getByRole("navigation").getByRole("link", { name: "SNOW VIKING トップページ", exact: true })).toBeVisible();
    const owns = list.getByRole("article", { name: "スノークルーズオーンズ", exact: true });
    await expect(owns.locator("time")).toHaveCount(0);
    await expect(owns.locator("dd")).toHaveText(["未取得", "未取得", "未取得", "未取得"]);
    const empty = list.getByRole("article", { name: "さっぽろばんけい", exact: true });
    await expect(empty.locator("dd")).toHaveText(["未取得", "未取得", "未取得", "未取得"]);
    const metrics = await owns.evaluate((element) => ({ height: element.getBoundingClientRect().height,
      background: getComputedStyle(element).backgroundColor }));
    expect(metrics.height).toBeLessThan(420);
    expect(metrics.background).toBe("rgb(255, 255, 255)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1280) {
      const bounds = await list.getByRole("article").evaluateAll((cards) => cards.slice(0, 3).map((card) => card.getBoundingClientRect().top));
      expect(new Set(bounds).size).toBe(1);
    }
    await page.screenshot({ path: test.info().outputPath("top.png") });
    await owns.screenshot({ path: test.info().outputPath("posted-card.png") });
    await expect(owns.getByLabel("現地コメント", { exact: true })).toHaveCount(0);
    await owns.getByRole("link", { name: "今のゲレンデコンディションを見る", exact: true }).click();
    await expect(page.getByRole("heading", { name: "スノークルーズオーンズ", level: 1, exact: true })).toBeVisible();
    await page.goto("/");
    await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
    await empty.getByRole("link", { name: "投稿する", exact: true }).click();
    await expect(page).toHaveURL(/\/post\?/);
    const params = new URL(page.url()).searchParams;
    expect(params.get("resort")).toBe("さっぽろばんけい");
    expect(params.get("region")).toBe("sapporo");
    expect(params.get("from")).toBe("detail");
    expect((await (await request.get(fixture + "/__stats")).json()).inserts).toBe(0);
  });
}
