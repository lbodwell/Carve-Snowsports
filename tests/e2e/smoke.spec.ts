import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

const developmentAdminPassword =
  process.env.DEV_ADMIN_PASSWORD ?? "carve-local-admin";
let administratorCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

test("serves health and the authenticated staff workspace", async ({
  page,
}) => {
  const health = await page.request.get("/health");
  expect(health.ok()).toBe(true);
  expect(await health.text()).toContain("Service available");

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill("admin@carve.local");
  await page.getByLabel("Password").fill(developmentAdminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin\/?$/);
  administratorCookies = await page.context().cookies();
  if (process.env.CARVE_UI_PROOF === "1")
    await page.screenshot({
      path: ".tmp/planning-dashboard.png",
      fullPage: true,
    });
  await expect(
    page.getByRole("heading", { name: "Planning readiness" }),
  ).toBeVisible();
  await page.goto("/admin/students");
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page
    .getByLabel("Program", { exact: true })
    .selectOption({ label: "Winter 2026 · Weekend Snowsports" });
  const firstStudent = page.locator("tbody tr").first();
  await expect(firstStudent).toBeVisible();
  await firstStudent.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Time", { exact: true }),
  ).toBeVisible();
  const saveStudent = page.getByRole("button", {
    name: "Save changes",
    exact: true,
  });
  await expect(saveStudent).toBeDisabled();
  await page
    .getByLabel("Placement notes", { exact: true })
    .fill(
      "Build confidence on turns; prefers a patient instructor and a familiar buddy.",
    );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Refresh", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Placement notes", { exact: true })).toHaveValue(
    "Build confidence on turns; prefers a patient instructor and a familiar buddy.",
  );
  await expect(saveStudent).toBeEnabled();
  await saveStudent.click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page).toHaveURL(/\/admin\/students\?programId=/);

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
  await page.locator("tbody tr").first().locator("td").nth(2).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save instructor", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Weekly availability", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Saturday availability" })
    .getByRole("button", { name: "Full day", exact: true })
    .click();
  const saturdayAvailability = page.getByRole("group", {
    name: "Saturday availability",
  });
  for (const name of ["AM", "PM", "Full day"]) {
    const button = saturdayAvailability.getByRole("button", {
      name,
      exact: true,
    });
    if ((await button.getAttribute("aria-pressed")) !== "true")
      await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Refresh", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Roster browser verification");
  if (process.env.CARVE_UI_PROOF === "1")
    await page.screenshot({
      path: ".tmp/instructor-details.png",
      fullPage: true,
    });
  if (process.env.CARVE_UI_PROOF === "1") {
    await page
      .getByRole("heading", { name: "Weekly availability", exact: true })
      .locator("../..")
      .screenshot({ path: ".tmp/weekly-availability.png" });
  }
  await page
    .getByRole("button", { name: "Save instructor", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Add instructor", exact: true })
    .click();
  await page.getByLabel("First name", { exact: true }).fill("Temporary");
  await page.getByLabel("Last name", { exact: true }).fill("Rosterfixture");
  await page.getByLabel("Phone", { exact: true }).fill("555-0100");
  await page
    .getByRole("button", { name: "Save instructor", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByLabel("Search instructors").fill("Temporary Rosterfixture");
  await expect(page.getByRole("status")).toContainText("1 matching instructor");
  await page.locator("tbody tr").click();
  await page
    .getByRole("button", { name: "Archive instructor", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(0);
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

  await expect(
    page.getByRole("heading", { name: /Ski · .*Level/ }).first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Preview rebuild", exact: true })
    .click();
  await expect(page.getByText(/instructor assignments cleared/)).toBeVisible();
  await page
    .getByRole("button", { name: "Replace scoped draft groups", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo rebuild", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Undo rebuild", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo rebuild", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Preview rebuild", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(
    page.getByText("No linked survey", { exact: false }),
  ).toHaveCount(0);
  const noteCard = page
    .getByRole("button")
    .filter({
      hasText:
        "Build confidence on turns; prefers a patient instructor and a familiar buddy.",
    })
    .first();
  await expect(noteCard).toBeVisible();
  await noteCard.click();
  await expect(
    page.getByRole("heading", { name: "Placement notes", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Scrollable groups").first()).toHaveCSS(
    "overflow-y",
    "auto",
  );
  const laneCards = page
    .getByLabel("Scrollable groups")
    .first()
    .locator('[data-slot="card"]');
  const firstBounds = await laneCards.nth(0).boundingBox();
  const thirdBounds = await laneCards.nth(2).boundingBox();
  expect(thirdBounds!.y).toBeGreaterThanOrEqual(
    firstBounds!.y + firstBounds!.height,
  );
  if (process.env.CARVE_UI_PROOF === "1") {
    await page.screenshot({
      path: ".tmp/grouping-workspace.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({ path: ".tmp/grouping-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await page.getByRole("button", { name: "Clear selection" }).click();
  await page.goto("/admin");
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(
    page.locator(".recharts-bar-rectangle path").first(),
  ).toBeVisible();
  if (process.env.CARVE_UI_PROOF === "1")
    await page.screenshot({
      path: ".tmp/planning-dashboard.png",
      fullPage: true,
    });
  await page.goto("/grouping");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText(/submitted/i)).toBeVisible();

  await page.goto("/admin/audit");
  await expect(
    page.getByRole("heading", { name: "Roster audit" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Rows per page" }),
  ).toHaveText("10");
  await page.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { name: "25", exact: true }).click();
  await expect(page).toHaveURL(/pageSize=25/);
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toHaveCount(1);
  await page.goto("/admin/surveys");
  await expect(
    page.getByRole("combobox", { name: "Rows per page" }),
  ).toHaveText("10");
  await page.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { name: "25", exact: true }).click();
  await expect(page).toHaveURL(/pageSize=25/);
  if (process.env.CARVE_UI_PROOF === "1")
    await page.screenshot({ path: ".tmp/survey-review.png", fullPage: true });
});

test("imports a new student, syncs their survey, and finalizes unstaffed placements", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/surveys/pre-lesson");
  await page.locator('[name="parentEmail"]').fill("review-parent@example.test");
  await page.locator('[name="childFirstName"]').fill("Ellis");
  await page.locator('[name="childLastName"]').fill("Reviewfixture");
  await page.getByRole("button", { name: "Choose a birthdate" }).click();
  await page.getByLabel("Choose the Year").selectOption("2016");
  await page.getByLabel("Choose the Month").selectOption("0");
  await page.getByRole("button", { name: /January 8th, 2016/ }).click();
  await page.getByRole("radio", { name: "Skier", exact: true }).click();
  await page.getByRole("combobox", { name: /Registered session/ }).click();
  await page
    .getByRole("option", { name: "Saturday AM (10–12)", exact: true })
    .click();
  await page.getByRole("radio", { name: /^Level 3/ }).click();
  await page
    .getByRole("checkbox", { name: "Surface lift", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Submit student information" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Thank you", exact: true }),
  ).toBeVisible();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("admin@carve.local");
  await page.getByLabel("Password").fill(developmentAdminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/admin/imports");
  const listing = [
    "DetailRowC0,CustomerName,textbox10,DetailRowC1,DetailRowC2,DetailRowC3,DetailRowC4,DetailRowC5,DetailRowC6",
    'synthetic-e2e-ellis,"Reviewfixture, Ellis",10,1/1/2026,1/10/2026,1,"PM | Ski | Children\'s Seasonal Program | 25/26 | Saturday | 7-12yrs | 10am",$719.00,Type:Sale; Status:Open',
  ].join("\n");
  await expect(
    page.getByLabel("Customer product listing", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Customer product listing", { exact: true })
    .setInputFiles({
      name: "listing.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(listing),
    });
  await page.getByRole("button", { name: "Validate and begin import" }).click();
  await expect(
    page.getByRole("button", { name: "Apply import", exact: true }),
  ).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: "Apply import", exact: true }).click();
  await expect(page.getByText("Roster updated", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto("/admin/students");
  await page
    .getByLabel("Program", { exact: true })
    .selectOption({ label: "Winter 2026 · Weekend Snowsports" });
  await page
    .getByLabel("Search students", { exact: true })
    .fill("Ellis Reviewfixture");
  const importedRow = page.locator("tbody tr");
  await expect(importedRow).toHaveCount(1);
  await expect(importedRow).toContainText("Saturday");
  await expect(importedRow).toContainText("10 AM–12 PM");
  if (process.env.CARVE_UI_PROOF === "1")
    await page.screenshot({
      path: ".tmp/registration-table.png",
      fullPage: true,
    });
  await importedRow.click();
  await expect(page.getByRole("dialog")).toContainText("10 AM–12 PM");
  if (process.env.CARVE_UI_PROOF === "1")
    await page.screenshot({
      path: ".tmp/registration-details.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/admin/surveys");
  await page.getByRole("button", { name: /Ellis Reviewfixture/ }).click();
  await expect(
    page.getByRole("heading", { name: "Linked student" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Student for Ellis Reviewfixture" })
    .selectOption({ label: "Ellis Reviewfixture · 2016-01-08" });
  await page.getByRole("button", { name: "Confirm student match" }).click();
  await expect(
    page.getByText("Student match confirmed.", { exact: true }),
  ).toBeVisible();

  await page.goto("/grouping");
  const returnForChanges = page.getByRole("button", {
    name: "Return for changes",
  });
  if (await returnForChanges.isVisible()) await returnForChanges.click();
  // Unmapped registrations stay out of the session pool until a matching lesson slot exists.
  await expect(
    page.locator("aside").getByRole("button", { name: /Ellis Reviewfixture/ }),
  ).toHaveCount(0);
  await page.goto("/admin/seasons");
  await page.getByRole("link", { name: "Configure" }).first().click();
  const slots = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "Time slots", exact: true }),
  });
  await slots.getByRole("button", { name: "Add", exact: true }).click();
  await slots.getByLabel("Label", { exact: true }).fill("Imported AM");
  await slots
    .getByRole("button", { name: "AM · 10:00–12:00", exact: true })
    .click();
  await slots.getByLabel("Saturday", { exact: true }).check();
  await slots
    .getByRole("button", { name: "Add time slot", exact: true })
    .click();
  await expect(slots.getByText("Imported AM", { exact: true })).toBeVisible();
  await page.goto("/admin/surveys");
  await page
    .getByRole("button", { name: "Re-link and sync", exact: true })
    .click();
  await expect(page.getByText(/Matching refreshed\./)).toBeVisible();
  await page.goto("/grouping");
  await page.getByLabel("Time", { exact: true }).click();
  await page
    .getByRole("option", {
      name: "Imported AM (10:00 AM–12:00 PM)",
      exact: true,
    })
    .click();
  await expect(
    page.locator("aside").getByRole("button", { name: /Ellis Reviewfixture/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Suggest remaining placements" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Remaining placements suggested.",
  );
  const unplacedEllis = page
    .locator("aside")
    .getByRole("button", { name: /Ellis Reviewfixture/ });
  // Wait for the refreshed placement projection. A snapshot visibility check
  // can see the old pool card just before automatic placement removes it.
  await expect(unplacedEllis).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Lesson groups" })
      .getByRole("button", { name: /Ellis Reviewfixture/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page
    .getByRole("button", { name: "Finalize student placements" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Finalized placements and history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish groups", exact: true }),
  ).toBeDisabled();
});

test("personal survey links work with the anonymous fallback disabled", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("admin@carve.local");
  await page.getByLabel("Password").fill(developmentAdminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/admin/surveys");
  await page
    .getByPlaceholder("parent@example.com")
    .fill("invited-review@example.test");
  await page.getByRole("button", { name: "Add email", exact: true }).click();
  await expect(
    page.getByText("Invitation link added.", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export email and link CSV" }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  const invitationUrl = csv
    .split(/\r?\n/)
    .find((line) => line.includes("invited-review@example.test"))!
    .match(/,"([^"]+)"$/)![1]!;
  await page
    .getByRole("checkbox", { name: "Allow the shared anonymous link" })
    .uncheck();
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(
    page.getByText("Survey access updated.", { exact: true }),
  ).toBeVisible();
  await page.goto(invitationUrl);
  await expect(
    page.getByText("Personal survey link for invited-review@example.test", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('[name="parentEmail"]')).toHaveValue(
    "invited-review@example.test",
  );
});

test("administrators can prepare separate seasonal cohorts with dates pending", async ({
  page,
}) => {
  // This scenario exercises configuration, reusing the session already verified
  // above so a fast production run does not intentionally trip login throttling.
  if (administratorCookies.length) {
    await page.context().addCookies(administratorCookies);
    await page.goto("/admin");
  } else {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("admin@carve.local");
    await page.getByLabel("Password").fill(developmentAdminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page).toHaveURL(/\/admin\/?$/);
  await page.goto("/admin/seasons");
  await page.getByRole("link", { name: "Configure" }).first().click();
  const section = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "Time slots", exact: true }),
  });
  for (const number of [1, 2]) {
    await section.getByRole("button", { name: "Add", exact: true }).click();
    await section
      .getByRole("button", {
        name: "Thu/Fri · 9:00 AM - Session " + number,
        exact: true,
      })
      .click();
    await section
      .getByRole("button", { name: "Add time slot", exact: true })
      .click();
    await expect(
      section.getByText(`9:00 AM - Session ${number}`, { exact: true }),
    ).toBeVisible();
  }
  await expect(section.getByText("Dates pending", { exact: true })).toHaveCount(
    2,
  );
  await page.goto("/grouping");
  await page.getByLabel("Day", { exact: true }).click();
  await page.getByRole("option", { name: "Thursday", exact: true }).click();
  const session = page.getByLabel("Time", { exact: true });
  await session.click();
  await page
    .getByRole("option", {
      name: "9:00 AM - Session 1",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Session 1 · Dates pending — groups can be built now", {
      exact: true,
    }),
  ).toBeVisible();
  await session.click();
  await page
    .getByRole("option", {
      name: "9:00 AM - Session 2",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Session 2 · Dates pending — groups can be built now", {
      exact: true,
    }),
  ).toBeVisible();
  if (process.env.CARVE_UI_PROOF === "1") {
    await session.click();
    await page.screenshot({
      path: ".tmp/weekday-sessions.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
  }
});
