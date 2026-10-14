import { expect, type Page } from "@playwright/test";

export async function selectRegion(page: Page, label: string) {
  const picker = page.getByRole("region", { name: "エリア選択" });
  await expect(picker).toBeVisible();
  const select = picker.getByRole("combobox");
  if (await select.isVisible()) await select.selectOption({ label });
  else await picker.getByRole("button", { name: label, exact: true }).click();
}
