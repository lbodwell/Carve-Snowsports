import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { signInAsAdmin } from "./admin-session";

test("splitting is discoverable and note previews do not obstruct neighbouring students", async ({
  page,
}) => {
  const databaseUrl = process.env.DATABASE_URL;
  const target = databaseUrl ? new URL(databaseUrl) : null;
  test.skip(
    !target ||
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      !(
        target.pathname === "/carve_test" ||
        (process.env.CI === "true" && target.pathname === "/carve")
      ),
    "Requires the isolated local carve_test database.",
  );
  const sql = postgres(databaseUrl!, { max: 1 });
  const studentIds: Array<string> = [];
  const registrationIds: Array<string> = [];
  let sourceGroupId: string | undefined;
  const longNotes =
    "Needs clear demonstrations and regular warm-up breaks. ".repeat(35);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsAdmin(page);
    await expect(page).toHaveURL(/\/admin\/?$/);
    await page.goto("/grouping");
    const create = page.getByRole("button", {
      name: "Create draft",
      exact: true,
    });
    if (await create.isVisible()) {
      await create.click();
      await expect(create).toBeHidden();
    }
    const [base] = await sql<
      Array<{
        draft_id: string;
        organization_id: string;
        program_id: string;
        discipline_id: string;
        age_band_id: string | null;
        ability_level_id: string;
        time_slot_id: string;
        weekday: number;
        starts_on: string;
        minimum_age: number | null;
        maximum_age: number | null;
      }>
    >`
      select g.draft_id, s.organization_id, d.program_id, g.discipline_id, g.age_band_id, g.ability_level_id, g.time_slot_id, g.weekday,
        s.starts_on::text, b.minimum_age, b.maximum_age
      from grouping_draft_groups g join grouping_drafts d on d.id=g.draft_id join programs p on p.id=d.program_id
        join seasons s on s.id=p.season_id join organizations o on o.id=s.organization_id left join age_bands b on b.id=g.age_band_id
      where o.name='Carve Demo Ski School' and d.status='editing' and g.ability_level_id is not null order by g.created_at limit 1`;
    if (!base)
      throw new Error("Seed an editable demo draft before this browser test.");
    const [source] = await sql<
      Array<{ id: string }>
    >`insert into grouping_draft_groups (draft_id,discipline_id,age_band_id,ability_level_id,time_slot_id,weekday,notes)
      values (${base.draft_id},${base.discipline_id},${base.age_band_id},${base.ability_level_id},${base.time_slot_id},${base.weekday},'UX regression fixture') returning id`;
    sourceGroupId = source!.id;
    const age = Math.floor(
      ((base.minimum_age ?? 7) + (base.maximum_age ?? 12)) / 2,
    );
    const birthdate =
      String(Number(base.starts_on.slice(0, 4)) - age) + "-01-01";
    for (const firstName of ["NotesOne", "NotesTwo"]) {
      const [student] = await sql<
        Array<{ id: string }>
      >`insert into people (organization_id,first_name,last_name,date_of_birth) values (${base.organization_id},${firstName},'UxFixture',${birthdate}) returning id`;
      studentIds.push(student!.id);
      await sql`insert into students (person_id,notes) values (${student!.id},${longNotes})`;
      const [registration] = await sql<
        Array<{ id: string }>
      >`insert into registrations (program_id,student_id,discipline_id,ability_level_id,source_snapshot)
        values (${base.program_id},${student!.id},${base.discipline_id},${base.ability_level_id},${sql.json({ groupingSchedule: { weekday: base.weekday, timeSlotId: base.time_slot_id } })}) returning id`;
      registrationIds.push(registration!.id);
      await sql`insert into grouping_draft_assignments (draft_id,draft_group_id,registration_id) values (${base.draft_id},${sourceGroupId},${registration!.id})`;
    }
    await page.goto(
      `/grouping?programId=${base.program_id}&weekday=${base.weekday}&timeSlotId=${base.time_slot_id}`,
    );
    const group = page.locator(`[data-group-id="${sourceGroupId}"]`);
    await group
      .getByRole("button", { name: "Split group", exact: true })
      .click();
    const firstStudent = group.getByRole("checkbox", {
      name: /NotesOne UxFixture/,
    });
    const secondStudent = group.getByRole("checkbox", {
      name: /NotesTwo UxFixture/,
    });
    await expect(
      group.getByRole("button", { name: "Split selected (0)", exact: true }),
    ).toBeDisabled();
    await firstStudent.check();
    await secondStudent.check();
    await expect(
      group.getByText("Leave at least one student in this group.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      group.getByRole("button", { name: "Split selected (2)", exact: true }),
    ).toBeDisabled();
    await secondStudent.uncheck();
    const firstNotes = group.getByRole("button", {
      name: "View notes for NotesOne UxFixture",
      exact: true,
    });
    const secondNotes = group.getByRole("button", {
      name: "View notes for NotesTwo UxFixture",
      exact: true,
    });
    await firstNotes.hover();
    await expect(
      page.getByRole("tooltip", {
        name: "NotesOne UxFixture notes preview",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCSS("pointer-events", "none");
    await secondNotes.hover();
    await expect(
      page.getByRole("tooltip", {
        name: "NotesOne UxFixture notes preview",
        exact: true,
      }),
    ).toBeHidden({ timeout: 250 });
    await expect(
      page.getByRole("tooltip", {
        name: "NotesTwo UxFixture notes preview",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(1);
    await firstStudent.hover();
    await expect(page.getByRole("tooltip")).toHaveCount(0, { timeout: 250 });
    await firstNotes.focus();
    await firstNotes.press("Enter");
    const notes = page.getByRole("dialog", {
      name: "NotesOne UxFixture · Student notes",
      exact: true,
    });
    await expect(
      notes.getByText(longNotes.trim(), { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await page.screenshot({ path: "out/ux-review/student-notes.png" });
    await page.keyboard.press("Escape");
    await expect(notes).toBeHidden();
    await expect(firstNotes).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(firstStudent).toBeChecked();
    await expect(secondStudent).not.toBeChecked();
    await page.screenshot({ path: "out/ux-review/split-selection.png" });
    await group
      .getByRole("button", { name: "Split selected (1)", exact: true })
      .click();
    await expect(
      group.getByRole("button", { name: "Split group", exact: true }),
    ).toBeDisabled();
    const [moved] = await sql<
      Array<{ draft_group_id: string }>
    >`select draft_group_id from grouping_draft_assignments where registration_id=${registrationIds[0]!}`;
    expect(moved!.draft_group_id).not.toBe(sourceGroupId);
    const [staffing] = await sql<
      Array<{ count: number }>
    >`select count(*)::int as count from grouping_draft_instructors where draft_group_id=${moved!.draft_group_id}`;
    expect(staffing!.count).toBe(0);
  } finally {
    if (registrationIds.length) {
      const groupIds = (
        await sql<
          Array<{ draft_group_id: string }>
        >`select distinct draft_group_id from grouping_draft_assignments where registration_id=any(${registrationIds}::uuid[])`
      ).map((row) => row.draft_group_id);
      if (sourceGroupId && !groupIds.includes(sourceGroupId))
        groupIds.push(sourceGroupId);
      await sql`delete from grouping_draft_assignments where registration_id=any(${registrationIds}::uuid[])`;
      await sql`delete from grouping_draft_instructors where draft_group_id=any(${groupIds}::uuid[])`;
      await sql`delete from grouping_draft_groups where id=any(${groupIds}::uuid[])`;
      await sql`delete from registrations where id=any(${registrationIds}::uuid[])`;
    } else if (sourceGroupId)
      await sql`delete from grouping_draft_groups where id=${sourceGroupId}`;
    if (studentIds.length) {
      await sql`delete from students where person_id=any(${studentIds}::uuid[])`;
      await sql`delete from people where id=any(${studentIds}::uuid[])`;
    }
    await sql.end();
  }
});
