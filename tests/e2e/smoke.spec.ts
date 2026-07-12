import { expect, test } from "@playwright/test";

test("serves health and the database-backed demo roster", async ({ page }) => {
  await page.goto("/health");
  await expect(
    page.getByRole("heading", { name: "Service available" }),
  ).toBeVisible();

  await page.goto("/demo");
  await expect(
    page.getByRole("heading", {
      name: /Carve Demo Ski School|Demo data not seeded/,
    }),
  ).toBeVisible();
  await expect(page.getByText("5 synthetic records")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(5);
});
