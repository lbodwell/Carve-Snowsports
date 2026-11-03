import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./admin-session";

test("grouping stays within the viewport and resets page scroll when returning from surveys", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await signInAsAdmin(page);
  const nav = page.getByRole("navigation", {
    name: "Admin navigation",
    exact: true,
  });
  await nav.getByRole("link", { name: "Grouping", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Build lesson groups" }),
  ).toBeVisible();
  const create = page.getByRole("button", {
    name: "Create draft",
    exact: true,
  });
  if (await create.isVisible()) await create.click();
  await expect(
    page.getByRole("region", { name: "Group board", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
  await nav.getByRole("link", { name: "Surveys", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Parent surveys", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await nav.getByRole("link", { name: "Grouping", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Build lesson groups" }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      ),
    )
    .toBeLessThanOrEqual(1);
});
