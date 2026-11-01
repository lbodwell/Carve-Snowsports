import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./admin-session";

test("defaults the sole program, preserves roster scroll, and restores grouping selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await signInAsAdmin(page);
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/admin/students");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByLabel("Program", { exact: true })).not.toHaveValue("");
  const lastRow = page.locator("tbody tr").last();
  await lastRow.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
  await lastRow.click();
  await page
    .getByLabel("Placement notes", { exact: true })
    .fill("Scroll preservation regression " + Date.now());
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(before - 5);
  await page.goto("/grouping");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("timeSlotId"))
    .toBeTruthy();
  const selected = new URL(page.url()).searchParams;
  await page.goto("/admin/students");
  await page.goto("/grouping");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("timeSlotId"))
    .toBe(selected.get("timeSlotId"));
  expect(new URL(page.url()).searchParams.get("weekday")).toBe(
    selected.get("weekday"),
  );
});

test("adds instructors by drag and drop while preserving the lead and filtering group details", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/grouping");
  if (
    await page
      .getByRole("button", { name: "Create draft", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Create draft", exact: true })
      .click();
  const skiGroups = page.locator(
    '[data-slot="card"][aria-label^="Lesson group: Ski"]',
  );
  let groupIndex = 0;
  for (let index = 0; index < (await skiGroups.count()); index++) {
    if ((await skiGroups.nth(index).textContent())?.includes("Jordan Lee")) {
      groupIndex = index;
      break;
    }
  }
  const group = skiGroups.nth(groupIndex);
  await expect(group).toBeVisible();
  if (await group.getByText("Jordan Lee", { exact: true }).count()) {
    await group.getByRole("button", { name: /^Edit / }).click();
    const details = page.getByRole("dialog");
    for (const name of ["Jordan Lee", "Casey Nguyen"]) {
      const checkbox = details.getByRole("checkbox", {
        name: new RegExp(name),
      });
      if (await checkbox.isChecked()) await checkbox.uncheck();
    }
    await details
      .getByRole("button", { name: "Save group", exact: true })
      .click();
    await expect(details).toBeHidden();
  }
  const pool = page
    .getByRole("heading", { name: "Instructors for this session" })
    .locator("..");
  const dragInstructor = async (name: string) => {
    const source = pool.getByText(name, { exact: true }).locator("..");
    await source.hover();
    const box = await source.boundingBox();
    if (!box) throw new Error("Instructor card is not visible");
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2, {
      steps: 5,
    });
    await group.hover();
    await group.hover();
    await page.mouse.up();
  };
  await dragInstructor("Jordan Lee");
  await expect(group).toContainText("Jordan Lee");
  await expect(page.getByRole("dialog")).toBeHidden();
  await dragInstructor("Casey Nguyen");
  await expect(group).toContainText("Also teaching: Casey Nguyen");
  await expect(
    group.getByRole("combobox", { name: /^Suggested lead/ }),
  ).toContainText("Jordan Lee");
  await group.getByRole("button", { name: /^Edit / }).click();
  const details = page.getByRole("dialog");
  await expect(details.getByText("Jordan Lee", { exact: true })).toBeVisible();
  await expect(
    details.getByText("Casey Nguyen", { exact: true }),
  ).toBeVisible();
  await expect(details.getByText("Morgan Rivera", { exact: true })).toHaveCount(
    0,
  );
});
