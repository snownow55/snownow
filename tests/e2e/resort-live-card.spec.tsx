import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, expect } from "@playwright/test";
import { ResortLiveCard } from "../../components/resort-live-card";

const resort = { id: 1, name: "オーンズ", display_name: "スノークルーズオーンズ", region_code: "sapporo", sort_order: 6, is_active: true };
const latest = { id: 1, resort: "オーンズ", area: "山頂・上部", snow_type: "パウダー", snowfall: "ほぼ無し", roughness: "きれい", crowd: "空いている", comment: '<script>unsafe</script>\n現地の長いコメント', created_at: "2026-10-14T12:01:00Z" };

test("retained full card renders real timestamps, metrics, safe memo and canonical links", async ({ page }) => {
  // Exercise the reserved view in the test process, never via a production
  // entitlement override or an unlocked route. It is not mounted by the home.
  const html = renderToStaticMarkup(<ResortLiveCard resort={resort} summary={{ latest, count: 1201 }} />);
  await page.setContent(html);
  const card = page.getByRole("article", { name: resort.display_name, exact: true });
  await expect(card.getByLabel("投稿日時（日本時間）", { exact: true })).toHaveText("10月14日 21:01");
  await expect(card.locator("time")).toHaveAttribute("datetime", latest.created_at);
  await expect(card).toContainText("最新投稿 1201件");
  await expect(card.locator("dd")).toHaveText(["パウダー", "きれい", "ほぼ無し", "空いている"]);
  await expect(card.getByLabel("現地コメント", { exact: true })).toHaveText(latest.comment);
  await expect(card).toContainText("山頂・上部");
  await expect(card.locator("script")).toHaveCount(0);
  await expect(card.getByRole("link", { name: "詳細を見る", exact: true })).toHaveAttribute("href", "/resort/" + encodeURIComponent(resort.name));
  const href = await card.getByRole("link", { name: "投稿する", exact: true }).getAttribute("href");
  expect(new URL(href!, "http://localhost").searchParams.get("resort")).toBe(resort.name);
});

test("retained full card omits absent times and blank memos", async ({ page }) => {
  await page.setContent(renderToStaticMarkup(<ResortLiveCard resort={resort} summary={{ latest: null, count: 0 }} />));
  await expect(page.getByText("現地投稿なし", { exact: true })).toBeVisible();
  await expect(page.locator("time")).toHaveCount(0);
  await expect(page.locator("dd")).toHaveText(["―", "―", "―", "―"]);
  await page.setContent(renderToStaticMarkup(<ResortLiveCard resort={resort} summary={{ latest: { ...latest, comment: "   ", area: "" }, count: 1 }} />));
  await expect(page.getByRole("group", { name: "現地メモ", exact: true })).toHaveCount(0);
});
