import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const master = JSON.parse(readFileSync("data/resort-master.json", "utf8"));
master.resorts = master.resorts.map((resort: object, index: number) => ({ ...resort, id: index + 1, is_active: true }));
test("morning uses current official records, keeps missing distinct, and expires at JST midnight", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-20T00:00:00Z") });
  const base = { status: "success", observation_date: "2026-11-20", observed_at: "2026-11-19T22:00:00Z",
    published_at: null, fetched_at: "2026-11-19T23:00:00Z", location_kind: "summit", location_name: "TEST山頂",
    source_url: "https://example.test/official", snowfall_period: "24時間", new_snow_cm: 0, snow_depth_cm: null,
    temperature_c: -5, official_snow_quality: null };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("External request blocked");
    if (url.pathname === "/rest/v1/official_morning_conditions") return route.fulfill({ json: [
      { ...base, resort_id: 1 }, { ...base, resort_id: 2, observation_date: "2025-11-20", new_snow_cm: 55 },
      { ...base, resort_id: 3, status: "missing", new_snow_cm: null },
      { ...base, resort_id: 4, new_snow_cm: 12, official_snow_quality: "公式発表の雪質表記", published_at: "2026-11-19T22:30:00Z" },
    ] });
    if (url.pathname === "/rest/v1/regions" || url.pathname === "/rest/v1/resorts") return route.fulfill({ json: master[url.pathname.endsWith("regions") ? "regions" : "resorts"] });
    return route.continue();
  });
  await page.goto("/");
  const list = page.getByRole("region", { name: "スキー場一覧", exact: true });
  const card = (id: number) => list.getByRole("article", { name: master.resorts[id - 1].display_name, exact: true });
  await expect(list.getByRole("article")).toHaveCount(62);
  await expect(list.getByRole("article", { name: "和寒東山スキー場", exact: true })).toHaveCount(0);
  await expect(card(1).getByText("新雪 +0cm", { exact: true })).toBeVisible();
  await expect(card(1).getByRole("definition")).toHaveText(["新雪 +0cm", "—", "-5℃"]);
  await expect(card(1).getByText("公式雪質", { exact: true })).toHaveCount(0);
  await expect(card(1).getByText("取得時刻：", { exact: false })).toBeVisible();
  await expect(card(1).getByText("新雪の観測期間：24時間", { exact: true })).toBeVisible();
  await expect(card(1).getByRole("link", { name: "公式情報を見る" })).toHaveAttribute("href", base.source_url);
  await expect(card(2).getByText("朝の情報は未掲載", { exact: true })).toBeVisible();
  await expect(card(2).getByText("新雪 +55cm", { exact: true })).toHaveCount(0);
  await expect(card(3).getByText("未発表", { exact: true })).toBeVisible();
  await expect(card(4).getByText("公式発表の雪質表記", { exact: true })).toBeVisible();
  await expect(card(4).getByLabel("公式情報の発表日時")).toBeVisible();
  await expect(card(4).getByText("取得時刻：", { exact: false })).toBeVisible();
  await page.clock.setFixedTime(new Date("2026-11-20T15:00:00Z"));
  await expect(card(1).getByText("新雪 +0cm", { exact: true })).toHaveCount(0);
  await expect(card(1).getByRole("definition")).toHaveText(["—", "—", "—"]);
  await page.getByRole("tab", { name: "ゲレンデの今", exact: false }).click();
  await expect(list.getByRole("article")).toHaveCount(63);
  await expect(list.getByRole("article", { name: "和寒東山スキー場", exact: true })).toBeVisible();
});
