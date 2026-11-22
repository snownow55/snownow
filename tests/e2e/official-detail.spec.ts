import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const master = JSON.parse(readFileSync("data/resort-master.json", "utf8"));
master.resorts = master.resorts.map((r: object, i: number) => ({ ...r, id: i + 1, is_active: true }));
const target = master.resorts.find((r: { name: string }) => r.name === "札幌国際スキー場");
for (const mode of ["current", "missing", "stale", "failed"] as const) {
  test(`real resort detail uses official data without changing demo: ${mode}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-22T00:00:00Z"));
    let officialReads = 0;
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (!["localhost", "127.0.0.1"].includes(url.hostname) || !["GET", "HEAD"].includes(request.method())) throw new Error("External access/write blocked");
      if (url.pathname === "/rest/v1/regions" || url.pathname === "/rest/v1/resorts") return route.fulfill({ json: master[url.pathname.endsWith("regions") ? "regions" : "resorts"] });
      if (url.pathname === "/rest/v1/official_morning_conditions") {
        officialReads++;
        if (mode === "failed") return route.fulfill({ status: 503, json: { message: "synthetic failure" } });
        return route.fulfill({ json: [{
          resort_id: target.id, status: mode === "missing" ? "missing" : "success",
          observation_date: mode === "stale" ? "2026-11-21" : "2026-11-22",
          fetched_at: "2026-11-21T23:45:00Z", published_at: "2026-11-21T23:00:00Z", observed_at: null,
          location_kind: "summit", location_name: "合成テスト地点",
          source_url: "https://www.sapporo-kokusai.jp/", snowfall_period: "昨晩から",
          new_snow_cm: mode === "missing" ? null : 0, snow_depth_cm: null, temperature_c: null, official_snow_quality: null,
        }] });
      }
      return route.continue();
    });
    await page.goto("/resort/" + encodeURIComponent(target.name));
    const section = page.getByRole("region", { name: "朝のコンディション（公式情報）", exact: true });
    if (mode === "current") {
      await expect(section.getByText("新雪 +0cm", { exact: true })).toBeVisible();
      await expect(section.getByText("公式情報は未取得です。", { exact: false })).toHaveCount(0);
      await expect(section.getByRole("link", { name: "公式情報を見る" })).toHaveAttribute("href", "https://www.sapporo-kokusai.jp/");
    } else {
      await expect(section.getByText(mode === "missing" ? "未発表" : mode === "stale" ? "朝の情報は未掲載" : "公式情報を取得できませんでした。", { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(section.getByRole("definition")).toHaveText(["—", "—", "—"]);
    }
    const readsBeforeDemo = officialReads;
    await page.goto("/demo/resort/" + encodeURIComponent(target.name));
    const demo = page.getByRole("region", { name: "朝のコンディション（公式情報）", exact: true });
    await expect(demo.getByText("公式情報は未取得です。", { exact: false })).toBeVisible();
    await expect(demo.getByRole("definition")).toHaveText(["—", "—", "—"]);
    expect(officialReads).toBe(readsBeforeDemo);
  });
}
