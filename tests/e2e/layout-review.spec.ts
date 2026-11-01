import { expect, test } from "@playwright/test";

test("desktop workbench keeps students, groups and instructors in one viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("admin@carve.local");
  await page
    .getByLabel("Password")
    .fill(process.env.DEV_ADMIN_PASSWORD ?? "carve-local-admin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/grouping");
  await expect(
    page.getByRole("button", { name: "Workspace tools", exact: true }),
  ).toBeEnabled();
  const students = page.getByRole("region", { name: "Student pool" });
  const groups = page.getByRole("region", { name: "Lesson groups" });
  const instructors = page
    .getByRole("heading", { name: "Instructors for this session" })
    .locator("..");
  await expect(groups).toBeVisible();
  await expect(instructors).toBeVisible();
  await expect(students).toBeVisible();
  const studentBox = (await students.boundingBox())!;
  const groupBox = (await groups.boundingBox())!;
  const instructorBox = (await instructors.boundingBox())!;
  expect(studentBox.x + studentBox.width).toBeLessThan(groupBox.x);
  expect(groupBox.x + groupBox.width).toBeLessThan(instructorBox.x);
  expect(Math.abs(studentBox.y - instructorBox.y)).toBeLessThan(5);
  expect(groupBox.height).toBeGreaterThan(600);
  const lanes = await groups
    .locator('[data-slot="card"][aria-label^="Lesson group:"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      }),
    );
  for (let a = 0; a < lanes.length; a++)
    for (let b = a + 1; b < lanes.length; b++) {
      expect(
        lanes[a]!.right <= lanes[b]!.left + 1 ||
          lanes[b]!.right <= lanes[a]!.left + 1 ||
          lanes[a]!.bottom <= lanes[b]!.top + 1 ||
          lanes[b]!.bottom <= lanes[a]!.top + 1,
      ).toBe(true);
    }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 2,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "out/layout-review/grouping-1920.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(groups).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 2,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "out/layout-review/grouping-1440.png" });
  await page
    .getByRole("button", { name: "Workspace tools", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Workspace tools" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview rebuild", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/admin/students");
  await expect(page.getByLabel("Program", { exact: true })).toBeEnabled();
  await expect(page.locator("table")).toBeVisible();
  await page.screenshot({ path: "out/layout-review/students-1920.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/grouping");
  await expect(
    page.getByRole("button", { name: "Workspace tools", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Build lesson groups" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "out/layout-review/grouping-mobile.png" });
});
