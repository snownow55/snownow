import { test, expect } from "@playwright/test";
import { loadDemoCatalog } from "../../lib/demo/master";

test("built demo works directly without Supabase configuration or authentication", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:3101" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || route.request().method() !== "GET") throw new Error("Unexpected demo request");
    await route.continue();
  });
  await page.goto("/demo?tab=live&sort=latest");
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(page.getByText("接続設定が未完了", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /ログイン|新規登録|投稿する/ })).toHaveCount(0);
  for (const resort of loadDemoCatalog().resorts.filter((resort) => resort.region_code === "asahikawa-furano")) {
    await page.goto("/demo/resort/" + encodeURIComponent(resort.name));
    await expect(page.getByRole("heading", { name: resort.display_name, exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(page.getByLabel("デモの注意事項")).toContainText("すべて架空");
  }
  await page.goto("/demo?region=all&tab=live&sort=latest");
  await expect(page.getByRole("article")).toHaveCount(59);
  await expect(page.getByText("デモ投稿なし", { exact: true })).toHaveCount(49);
  await page.goto("/demo/resort/" + encodeURIComponent("キロロ"));
  await expect(page.getByRole("heading", { name: "デモ投稿なし", exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "投稿を体験する", exact: true }).click();
  await page.getByRole("textbox").fill("接続設定なしの体験投稿");
  await page.getByRole("button", { name: "体験投稿を保存する", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("体験投稿・このブラウザのみ");
  await expect(page.getByRole("article")).toContainText("接続設定なしの体験投稿");
  await page.reload();
  await expect(page.getByRole("article")).toContainText("接続設定なしの体験投稿");
  expect(errors).toEqual([]);
});
