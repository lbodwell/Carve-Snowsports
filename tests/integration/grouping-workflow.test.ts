import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  createTimeSlot,
  updateTimeSlot,
} from "@/application/services/program-configuration-service.server";

import {
  approveGroupingDraft,
  assignDraftInstructor,
  createDraftGroup,
  createGroupingDraft,
  getGroupingWorkspace,
  moveRegistration,
  publishGroupingDraft,
  returnGroupingDraft,
  setRegistrationSchedule,
  submitGroupingDraft,
  suggestRemainingPlacements,
  undoDraftOperation,
} from "@/application/services/grouping-draft-service.server";
import {
  abilityLevels,
  ageBands,
  auditEvents,
  disciplines,
  groupRevisionMemberships,
  groupingDraftAssignments,
  groupingDraftGroups,
  groupingDrafts,
  instructorQualifications,
  instructors,
  lessonInstances,
  organizationMemberships,
  organizations,
  people,
  programs,
  registrations,
  seasonGroups,
  seasons,
  students,
  timeSlots,
  users,
} from "@/db/schema";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for integration tests. Set it to the local carve_test database.",
  );
}

const testUrl = new URL(testDatabaseUrl);

if (
  !["localhost", "127.0.0.1", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/carve_test"
) {
  throw new Error(
    "TEST_DATABASE_URL must point to the local database named carve_test.",
  );
}

const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";

const adminSql = postgres(adminUrl.toString(), { max: 1 });
const testSql = postgres(testUrl.toString(), { max: 1 });
const db = drizzle(testSql);

describe("grouping workflow integration", () => {
  let organizationId: string;
  let adminUserId: string;
  let programId: string;
  let registrationIds: Array<string>;
  let instructorPersonId: string;

  beforeAll(async () => {
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.unsafe("CREATE DATABASE carve_test");

    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });

    const [organization] = await db
      .insert(organizations)
      .values({ name: "Grouping School", timezone: "America/New_York" })
      .returning({ id: organizations.id });
    if (!organization) throw new Error("Unable to seed grouping organization.");
    organizationId = organization.id;

    adminUserId = randomUUID();
    await db.insert(users).values({
      id: adminUserId,
      email: "grouping-admin@carve.test",
      name: "Grouping Admin",
      emailVerified: true,
    });
    await db.insert(organizationMemberships).values({
      organizationId,
      userId: adminUserId,
      role: "admin",
    });

    const [season] = await db
      .insert(seasons)
      .values({
        organizationId,
        name: "Winter 2026",
        startsOn: "2026-01-03",
        endsOn: "2026-03-22",
        status: "active",
      })
      .returning({ id: seasons.id });
    if (!season) throw new Error("Unable to seed grouping season.");

    const [program] = await db
      .insert(programs)
      .values({
        seasonId: season.id,
        name: "Weekend Program",
        status: "active",
      })
      .returning({ id: programs.id });
    if (!program) throw new Error("Unable to seed grouping program.");
    programId = program.id;

    const configuredDisciplines = await db
      .insert(disciplines)
      .values([
        { programId, key: "ski", label: "Ski", displayOrder: 1 },
        { programId, key: "snowboard", label: "Snowboard", displayOrder: 2 },
      ])
      .returning();
    await db.insert(abilityLevels).values(
      [1, 2, 3].map((numericRank) => ({
        programId,
        key: `level-${numericRank}`,
        label: `Level ${numericRank}`,
        numericRank,
        displayOrder: numericRank,
      })),
    );
    await db.insert(ageBands).values([
      {
        programId,
        label: "Ages 7–12",
        minimumAge: 7,
        maximumAge: 12,
        displayOrder: 1,
      },
    ]);
    const [slot] = await db
      .insert(timeSlots)
      .values({
        programId,
        key: "am",
        label: "Morning",
        startsAt: "09:00",
        endsAt: "12:00",
        displayOrder: 1,
      })
      .returning({ id: timeSlots.id });
    if (!slot) throw new Error("Unable to seed grouping time slot.");

    const [instructorPerson] = await db
      .insert(people)
      .values({
        organizationId,
        firstName: "Jordan",
        lastName: "Lee",
      })
      .returning({ id: people.id });
    if (!instructorPerson) {
      throw new Error("Unable to seed grouping instructor.");
    }
    instructorPersonId = instructorPerson.id;
    await db.insert(instructors).values({ personId: instructorPerson.id });
    await db.insert(instructorQualifications).values({
      instructorId: instructorPerson.id,
      disciplineId: configuredDisciplines[0]!.id,
    });

    registrationIds = [];
    for (const [firstName, lastName, dateOfBirth] of [
      ["Avery", "Chen", "2016-01-08"],
      ["Rowan", "Patel", "2016-03-14"],
    ] as const) {
      const [person] = await db
        .insert(people)
        .values({
          organizationId,
          firstName,
          lastName,
          dateOfBirth,
        })
        .returning({ id: people.id });
      if (!person) continue;
      await db.insert(students).values({ personId: person.id });
      const [registration] = await db
        .insert(registrations)
        .values({
          studentId: person.id,
          programId,
          status: "active",
          disciplineId: configuredDisciplines[0]!.id,
        })
        .returning({ id: registrations.id });
      if (registration) registrationIds.push(registration.id);
    }
  });

  afterAll(async () => {
    await testSql.end({ timeout: 5 });
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.end({ timeout: 5 });
  });

  test("auto-draft, submit, approve, and publish create season groups and lessons", async () => {
    const actor = {
      userId: adminUserId,
      organizationId,
      role: "admin" as const,
    };

    const draft = await createGroupingDraft(actor, { programId });
    expect(draft.id).toBeTruthy();

    const groups = await db
      .select()
      .from(groupingDraftGroups)
      .where(eq(groupingDraftGroups.draftId, draft.id));
    expect(groups.length).toBeGreaterThan(0);

    const [creationAudit] = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, draft.id));
    expect(creationAudit?.action).toBe("grouping.draft_created");

    let draftVersion = 1;
    for (const group of groups) {
      const assigned = await assignDraftInstructor(actor, {
        draftId: draft.id,
        baseVersion: draftVersion,
        commandId: randomUUID(),
        groupId: group.id,
        instructorIds: [instructorPersonId],
        leadInstructorId: instructorPersonId,
      });
      draftVersion = assigned.version;
    }

    const submitted = await submitGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: draftVersion,
    });
    expect(submitted.status).toBe("submitted");

    const [submittedDraft] = await db
      .select({
        version: groupingDrafts.version,
        status: groupingDrafts.status,
      })
      .from(groupingDrafts)
      .where(eq(groupingDrafts.id, draft.id));
    expect(submittedDraft?.status).toBe("submitted");

    const approved = await approveGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: submittedDraft?.version ?? 2,
    });
    expect(approved.status).toBe("approved");

    const idempotencyKey = randomUUID();
    const published = await publishGroupingDraft(actor, {
      draftId: draft.id,
      idempotencyKey,
    });
    expect(published.seasonGroupIds.length).toBe(groups.length);

    const republished = await publishGroupingDraft(actor, {
      draftId: draft.id,
      idempotencyKey,
    });
    expect(republished.seasonGroupIds).toEqual(published.seasonGroupIds);

    const publishedGroups = await db
      .select()
      .from(seasonGroups)
      .where(eq(seasonGroups.programId, programId));
    expect(publishedGroups).toHaveLength(groups.length);

    const lessons = await db.select().from(lessonInstances);
    expect(lessons.length).toBeGreaterThan(0);

    const memberships = await db.select().from(groupRevisionMemberships);
    expect(memberships.length).toBeGreaterThan(0);

    const [finalDraft] = await db
      .select({
        status: groupingDrafts.status,
        publishedAt: groupingDrafts.publishedAt,
      })
      .from(groupingDrafts)
      .where(eq(groupingDrafts.id, draft.id));
    expect(finalDraft?.status).toBe("published");
    expect(finalDraft?.publishedAt).toBeTruthy();
  });

  test("supports direct moves, reviewed sessions, incremental suggestions and return for changes", async () => {
    const actor = {
      userId: adminUserId,
      organizationId,
      role: "admin" as const,
    };
    const [slot] = await db
      .select()
      .from(timeSlots)
      .where(eq(timeSlots.programId, programId));
    const [discipline] = await db
      .select()
      .from(disciplines)
      .where(eq(disciplines.programId, programId));
    const draft = await createGroupingDraft(actor, {
      programId,
      mode: "manual",
      weekday: 0,
      timeSlotId: slot!.id,
    });
    expect((await getGroupingWorkspace(actor, { programId })).groups).toEqual(
      [],
    );
    let version = 1;
    const groupIds = [];
    for (let index = 0; index < 2; index++) {
      const created = await createDraftGroup(actor, {
        draftId: draft.id,
        baseVersion: version,
        commandId: randomUUID(),
        weekday: 0,
        timeSlotId: slot!.id,
        disciplineId: discipline!.id,
        abilityLevelId: null,
        ageBandId: null,
      });
      version = created.version;
      groupIds.push(created.groupId);
    }
    const move = async (
      registrationId: string,
      groupId: string | null,
      fromGroupId?: string,
    ) => {
      const result = await moveRegistration(actor, {
        draftId: draft.id,
        baseVersion: version,
        commandId: randomUUID(),
        registrationId,
        groupId,
        fromGroupId,
      });
      version = result.version;
    };
    await move(registrationIds[0]!, groupIds[0]!);
    await move(registrationIds[0]!, groupIds[1]!, groupIds[0]);
    const undone = await undoDraftOperation(actor, {
      draftId: draft.id,
      baseVersion: version,
      commandId: randomUUID(),
    });
    version = undone.version;
    await db
      .update(registrations)
      .set({
        sourceSnapshot: {
          sourceKey: "synthetic-source",
          weekday: "Sunday",
          session: "Unmapped morning",
        },
      })
      .where(eq(registrations.id, registrationIds[1]!));
    await expect(move(registrationIds[1]!, groupIds[0]!)).rejects.toMatchObject(
      { code: "VALIDATION" },
    );
    await setRegistrationSchedule(actor, {
      registrationId: registrationIds[1]!,
      weekday: 0,
      timeSlotId: slot!.id,
    });
    const suggestions = await suggestRemainingPlacements(actor, {
      draftId: draft.id,
      baseVersion: version,
      weekday: 0,
      timeSlotId: slot!.id,
    });
    version = suggestions.version;
    const assignments = await db
      .select()
      .from(groupingDraftAssignments)
      .where(eq(groupingDraftAssignments.draftId, draft.id));
    expect(assignments).toHaveLength(2);
    expect(
      assignments.find((row) => row.registrationId === registrationIds[0])
        ?.draftGroupId,
    ).toBe(groupIds[0]);
    const submitted = await submitGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: version,
    });
    const returned = await returnGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: submitted.version,
    });
    version = returned.version;
    expect(
      (await getGroupingWorkspace(actor, { programId })).draft?.status,
    ).toBe("editing");
    for (let index = 0; index < 5; index++) {
      const [person] = await db
        .insert(people)
        .values({
          organizationId,
          firstName: `Capacity${index}`,
          lastName: "Synthetic",
          dateOfBirth: "2016-01-08",
        })
        .returning({ id: people.id });
      await db.insert(students).values({ personId: person!.id });
      const [registration] = await db
        .insert(registrations)
        .values({
          studentId: person!.id,
          programId,
          disciplineId: discipline!.id,
          status: "active",
        })
        .returning({ id: registrations.id });
      if (index < 4) await move(registration!.id, groupIds[0]!);
      else
        await expect(
          move(registration!.id, groupIds[0]!),
        ).rejects.toMatchObject({ code: "VALIDATION" });
    }
    const [persisted] = await db
      .select()
      .from(groupingDrafts)
      .where(eq(groupingDrafts.id, draft.id));
    expect(persisted?.version).toBe(version);
  });

  test("numbered cohorts stay separate, share staff, and publish their own dated calendars", async () => {
    const actor = {
      userId: adminUserId,
      organizationId,
      role: "admin" as const,
    };
    const [original] = await db
      .select()
      .from(programs)
      .where(eq(programs.id, programId));
    const [program] = await db
      .insert(programs)
      .values({
        seasonId: original!.seasonId,
        name: "Two seasonal cohorts",
        status: "active",
      })
      .returning();
    await db.insert(ageBands).values({
      programId: program!.id,
      label: "Children",
      minimumAge: 7,
      maximumAge: 12,
    });
    const [discipline] = await db
      .insert(disciplines)
      .values({ programId: program!.id, key: "ski", label: "Ski" })
      .returning();
    await db.insert(instructorQualifications).values({
      instructorId: instructorPersonId,
      disciplineId: discipline!.id,
    });
    const slots = [];
    for (const number of [1, 2] as const) {
      slots.push(
        await createTimeSlot(actor, {
          programId: program!.id,
          key: `session-${number}`,
          label: `Session ${number}`,
          startsAt: "10:00",
          endsAt: "12:00",
          cohort: `session-${number}`,
          startsOn: null,
          endsOn: null,
          excludedDates: [],
          displayOrder: number,
        }),
      );
    }
    const [child] = await db
      .insert(people)
      .values({
        organizationId,
        firstName: "Cohort",
        lastName: "Fixture",
        dateOfBirth: "2016-01-01",
      })
      .returning();
    await db.insert(students).values({ personId: child!.id });
    const enrollments = await db
      .insert(registrations)
      .values(
        [1, 2].map((number) => ({
          programId: program!.id,
          studentId: child!.id,
          disciplineId: discipline!.id,
          status: "active" as const,
          sourceSnapshot: {
            sourceKey: `cohort-fixture-${number}`,
            weekday: "Saturday",
            session: `Session ${number}`,
          },
        })),
      )
      .returning();
    await expect(
      setRegistrationSchedule(actor, {
        registrationId: enrollments[0]!.id,
        weekday: 6,
        timeSlotId: slots[1]!.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const draft = await createGroupingDraft(actor, {
      programId: program!.id,
      mode: "suggested",
      weekday: 6,
      timeSlotId: slots[0]!.id,
    });
    const groups = await db
      .select()
      .from(groupingDraftGroups)
      .where(eq(groupingDraftGroups.draftId, draft.id));
    expect(groups).toHaveLength(2);
    expect(
      groups.every((group) => group.leadInstructorId === instructorPersonId),
    ).toBe(true);
    const submitted = await submitGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: 1,
    });
    await approveGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: submitted.version,
    });
    const publication = { draftId: draft.id, idempotencyKey: randomUUID() };
    await expect(
      publishGroupingDraft(actor, publication),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    for (const [index, slot] of slots.entries()) {
      await updateTimeSlot(actor, {
        timeSlotId: slot.id,
        label: slot.label,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        cohort: index === 0 ? "session-1" : "session-2",
        startsOn: index === 0 ? "2026-01-03" : "2026-02-07",
        endsOn: index === 0 ? "2026-01-31" : "2026-02-28",
        excludedDates: index === 0 ? ["2026-01-10"] : [],
        displayOrder: index,
        active: true,
      });
    }
    const [changedDraft] = await db
      .select()
      .from(groupingDrafts)
      .where(eq(groupingDrafts.id, draft.id));
    expect(changedDraft?.status).toBe("editing");
    const reviewed = await submitGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: changedDraft!.version,
    });
    await approveGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: reviewed.version,
    });
    await publishGroupingDraft(actor, publication);
    const calendar = await db
      .select({
        date: lessonInstances.lessonDate,
        slot: lessonInstances.timeSlotId,
      })
      .from(lessonInstances)
      .where(eq(lessonInstances.timeSlotId, slots[0]!.id));
    expect(calendar.map((row) => row.date)).toEqual([
      "2026-01-03",
      "2026-01-17",
      "2026-01-24",
      "2026-01-31",
    ]);
    const later = await db
      .select({ date: lessonInstances.lessonDate })
      .from(lessonInstances)
      .where(eq(lessonInstances.timeSlotId, slots[1]!.id));
    expect(later.map((row) => row.date)).toEqual([
      "2026-02-07",
      "2026-02-14",
      "2026-02-21",
      "2026-02-28",
    ]);
    await expect(
      updateTimeSlot(actor, {
        timeSlotId: slots[0]!.id,
        label: "Changed",
        startsAt: "11:00",
        endsAt: "12:00",
        cohort: "session-1",
        startsOn: null,
        endsOn: null,
        excludedDates: [],
        displayOrder: 1,
        active: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
