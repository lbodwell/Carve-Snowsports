import { expect, test } from "@playwright/test";

const developmentAdminPassword =
  process.env.DEV_ADMIN_PASSWORD ?? "carve-local-admin";

test("serves health and the database-backed demo roster", async ({ page }) => {
  page.on("request", (request) => {
    if (request.url().includes("auth")) console.info("request", request.url());
  });
  page.on("response", async (response) => {
    if (response.url().includes("/api/auth/")) {
      console.info(response.status(), response.url(), await response.text());
    }
  });
  await page.goto("/health");
  await expect(
    page.getByRole("heading", { name: "Service available" }),
  ).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill("admin@carve.local");
  await page.getByLabel("Password").fill(developmentAdminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  console.info(await page.context().cookies());
  await expect(page).toHaveURL(/\/admin\/?$/);
  await expect(
    page.getByRole("heading", { name: "Season operations" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /need a program registration\.|All roster records are registered\./,
    ),
  ).toBeVisible();

  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  const firstStudent = page.locator("tbody tr").first();
  await expect(firstStudent).toBeVisible();
  await firstStudent.getByRole("link").click();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();

  await page.goto("/admin/students/new");
  await expect(
    page.getByRole("heading", { name: "Add student" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create student" }),
  ).toBeVisible();

  await page.goto("/admin/instructors");
  await expect(
    page.getByRole("heading", { name: "Instructors" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add instructor" }),
  ).toBeVisible();

  await page.goto("/admin/seasons");
  await expect(
    page.getByRole("heading", { name: "Seasons & programs" }),
  ).toBeVisible();
  await expect(page.getByText("Winter 2026")).toBeVisible();
  await expect(page.getByText("Weekend Snowsports")).toBeVisible();
  await page.getByRole("link", { name: "Configure" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Weekend Snowsports" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Disciplines" }),
  ).toBeVisible();
  await expect(page.getByText("Ski", { exact: true })).toBeVisible();

  await page.goto("/grouping");
  const createDraft = page.getByRole("button", { name: "Create draft" });
  if (await createDraft.isVisible()) {
    await createDraft.click();
  }
  await expect(
    page.getByRole("heading", { name: "Build lesson groups" }),
  ).toBeVisible();

  const generatedGroup = page.getByText("Group 1", { exact: true });
  if ((await generatedGroup.count()) === 0) {
    const newGroup = page.getByRole("button", { name: "New group" });
    if (
      (await page.getByText("No groups in this day and time slot.").count()) > 0
    ) {
      await newGroup.click();
    }
  }
  await expect(page.getByText("Group 1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText(/submitted/i)).toBeVisible();

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Roster audit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
});
