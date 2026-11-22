import { test, expect } from "@playwright/test";
const fixture = "http://127.0.0.1:54321";
const midnight = Date.parse("2026-11-21T15:00:00Z");
const base = { resort: "オーンズ", area: "中腹", snow_type: "パウダー", snowfall: "ほぼ無し", roughness: "きれい", crowd: "普通", updated_at: null };
for (const detail of [false, true]) {
  for (const resume of [false, true]) {
    test(`JST midnight replaces posts and counts: ${detail ? "detail" : "list"}, ${resume ? "resume" : "timer"}`, async ({ page, request }) => {
      await request.post(fixture + "/__control", { data: { reset: true, postReadNow: midnight - 1000, posts: [
        { ...base, id: 1, comment: "yesterday", created_at: new Date(midnight - 86400001).toISOString() },
        { ...base, id: 2, comment: "before-midnight", created_at: new Date(midnight - 1000).toISOString() },
        { ...base, id: 3, comment: "after-midnight", created_at: new Date(midnight).toISOString() },
        { ...base, id: 4, comment: "tomorrow", created_at: new Date(midnight + 86400000).toISOString() },
      ] } });
      await page.clock.install({ time: midnight - 60000 });
      await page.clock.pauseAt(midnight - 1000);
      await page.goto(detail ? "/resort/" + encodeURIComponent("オーンズ") : "/?tab=live&region=sapporo");
      await expect(page.getByText("before-midnight", { exact: false })).toBeVisible();
      await expect(page.getByText("after-midnight", { exact: false })).toHaveCount(0);
      await expect(page.getByText("yesterday", { exact: false })).toHaveCount(0);
      if (!detail) await expect(page.getByRole("article", { name: "スノークルーズオーンズ", exact: true })).toContainText("最新投稿 1件");
      await request.post(fixture + "/__control", { data: { postReadNow: midnight + 1000 } });
      if (resume) {
        await page.clock.setSystemTime(midnight + 1000);
        await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      } else await page.clock.fastForward(2000);
      await expect(page.getByText("before-midnight", { exact: false })).toHaveCount(0);
      await expect(page.getByText("after-midnight", { exact: false })).toBeVisible();
      await expect(page.getByText("tomorrow", { exact: false })).toHaveCount(0);
      if (!detail) await expect(page.getByRole("article", { name: "スノークルーズオーンズ", exact: true })).toContainText("最新投稿 1件");
      expect((await (await request.get(fixture + "/__stats")).json()).posts).toHaveLength(4);
    });
  }
}
