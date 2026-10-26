import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  decideGroupChange,
  getGroupLifecycle,
  proposeGroupChange,
} from "@/application/services/group-lifecycle-service.server";
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
  rebuildGroupingDraft,
  returnGroupingDraft,
  setRegistrationSchedule,
  submitGroupingDraft,
  suggestRemainingPlacements,
  undoDraftOperation,
  undoRebuild,
  updateDraftGroup,
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
  lessonAttendance,
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
    const [level] = await db
      .select()
      .from(abilityLevels)
      .where(eq(abilityLevels.programId, programId));
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
        allowedWeekdays: [0, 6],
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
    await db.insert(instructors).values({
      personId: instructorPerson.id,
      preferences: [
        {
          programId,
          cohort: "season",
          weekday: 6,
          startsAt: "00:00",
          endsAt: "23:59",
          minimumAge: null,
          maximumAge: null,
          minimumLevel: null,
          maximumLevel: null,
        },
      ],
    });
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
          abilityLevelId: level!.id,
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
      await expect(
        updateDraftGroup(actor, {
          draftId: draft.id,
          baseVersion: draftVersion,
          commandId: randomUUID(),
          groupId: group.id,
          weekday: group.weekday,
          timeSlotId: group.timeSlotId,
          disciplineId: group.disciplineId!,
          ageBandId: group.ageBandId,
          abilityLevelId: group.abilityLevelId,
          notes: "Must not persist after invalid staffing",
          instructorIds: [],
          leadInstructorId: instructorPersonId,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      const [unchanged] = await db
        .select()
        .from(groupingDraftGroups)
        .where(eq(groupingDraftGroups.id, group.id));
      expect(unchanged!.notes).toBe(group.notes);
      const assigned = await updateDraftGroup(actor, {
        draftId: draft.id,
        baseVersion: draftVersion,
        commandId: randomUUID(),
        groupId: group.id,
        weekday: group.weekday,
        timeSlotId: group.timeSlotId,
        disciplineId: group.disciplineId!,
        ageBandId: group.ageBandId,
        abilityLevelId: group.abilityLevelId,
        notes: "Combined details and staffing save",
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
    const configuredLevels = await db
      .select()
      .from(abilityLevels)
      .where(eq(abilityLevels.programId, programId));
    const [placedRegistration] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationIds[0]!));
    const differentLevel = configuredLevels.find(
      (level) => level.id !== placedRegistration!.abilityLevelId,
    )!;
    await expect(
      updateDraftGroup(actor, {
        draftId: draft.id,
        baseVersion: version,
        commandId: randomUUID(),
        groupId: groupIds[0]!,
        weekday: 0,
        timeSlotId: slot!.id,
        disciplineId: discipline!.id,
        abilityLevelId: differentLevel.id,
        ageBandId: null,
        notes: "",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
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
    await expect(
      undoDraftOperation(actor, {
        draftId: draft.id,
        baseVersion: version,
        commandId: randomUUID(),
      }),
    ).rejects.toThrow("draft changed after this operation");
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
      await move(registration!.id, groupIds[0]!);
    }
    const [persisted] = await db
      .select()
      .from(groupingDrafts)
      .where(eq(groupingDrafts.id, draft.id));
    expect(persisted?.version).toBe(version);
    const largeGroup = await db
      .select()
      .from(groupingDraftAssignments)
      .where(eq(groupingDraftAssignments.draftGroupId, groupIds[0]!));
    expect(largeGroup.length).toBeGreaterThan(6);
    const resubmitted = await submitGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: version,
    });
    await approveGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: resubmitted.version,
    });
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
    const [cohortLevel] = await db
      .insert(abilityLevels)
      .values({
        programId: program!.id,
        key: "level-1",
        label: "Level 1",
        numericRank: 1,
      })
      .returning();
    await db
      .update(instructors)
      .set({
        preferences: [1, 2].map((number) => ({
          ...{
            programId,
            cohort: "season",
            weekday: 6,
            startsAt: "00:00",
            endsAt: "23:59",
            minimumAge: null,
            maximumAge: null,
            minimumLevel: null,
            maximumLevel: null,
          },
          programId: program!.id,
          cohort:
            number === 1 ? ("session-1" as const) : ("session-2" as const),
        })),
      })
      .where(eq(instructors.personId, instructorPersonId));
    const slots = [];
    for (const number of [1, 2] as const) {
      slots.push(
        await createTimeSlot(actor, {
          programId: program!.id,
          allowedWeekdays: [6],
          key: `session-${number}`,
          label: `Session ${number}`,
          startsAt: "13:00",
          endsAt: "15:00",
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
          abilityLevelId: cohortLevel!.id,
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
    expect(groups.every((group) => group.leadInstructorId === null)).toBe(true);
    let version = 1;
    for (const group of groups) {
      version = (
        await assignDraftInstructor(actor, {
          draftId: draft.id,
          baseVersion: version,
          commandId: randomUUID(),
          groupId: group.id,
          instructorIds: [instructorPersonId],
          leadInstructorId: instructorPersonId,
        })
      ).version;
    }
    await submitGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: version,
    });
    const publication = { draftId: draft.id, idempotencyKey: randomUUID() };
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
        allowedWeekdays: [6],
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

  test("scoped rebuilds restore snapshots and finalized moves require versioned approval", async () => {
    const actor = {
      userId: adminUserId,
      organizationId,
      role: "admin" as const,
    };
    const [season] = await db
      .insert(seasons)
      .values({
        organizationId,
        name: "Lifecycle 2030",
        startsOn: "2030-01-01",
        endsOn: "2030-03-31",
        status: "active",
      })
      .returning();
    const [program] = await db
      .insert(programs)
      .values({
        seasonId: season!.id,
        name: "Lifecycle fixtures",
        status: "active",
      })
      .returning();
    const [discipline] = await db
      .insert(disciplines)
      .values({ programId: program!.id, key: "ski", label: "Ski" })
      .returning();
    const [band] = await db
      .insert(ageBands)
      .values({
        programId: program!.id,
        label: "Children",
        minimumAge: 7,
        maximumAge: 12,
      })
      .returning();
    const levels = await db
      .insert(abilityLevels)
      .values(
        [1, 2].map((n) => ({
          programId: program!.id,
          key: "level-" + n,
          label: "Level " + n,
          numericRank: n,
        })),
      )
      .returning();
    const [slot] = await db
      .insert(timeSlots)
      .values({
        programId: program!.id,
        key: "am",
        label: "Morning",
        startsAt: "09:00",
        endsAt: "12:00",
        allowedWeekdays: [0, 6],
      })
      .returning();
    await db.insert(instructorQualifications).values({
      instructorId: instructorPersonId,
      disciplineId: discipline!.id,
    });
    await db
      .update(instructors)
      .set({
        preferences: [
          {
            programId: program!.id,
            cohort: "season",
            weekday: 6,
            startsAt: "09:00",
            endsAt: "12:00",
            minimumAge: null,
            maximumAge: null,
            minimumLevel: null,
            maximumLevel: null,
          },
        ],
      })
      .where(eq(instructors.personId, instructorPersonId));
    const ids: Array<string> = [];
    for (let n = 0; n < 3; n++) {
      const [person] = await db
        .insert(people)
        .values({
          organizationId,
          firstName: "Lifecycle" + n,
          lastName: "Student",
          dateOfBirth: "2020-01-01",
        })
        .returning();
      await db.insert(students).values({ personId: person!.id });
      const [registration] = await db
        .insert(registrations)
        .values({
          programId: program!.id,
          studentId: person!.id,
          disciplineId: discipline!.id,
          abilityLevelId: levels[n === 2 ? 1 : 0]!.id,
          sourceSnapshot: {
            groupingSchedule: { weekday: 6, timeSlotId: slot!.id },
          },
        })
        .returning();
      ids.push(registration!.id);
    }
    const draft = await createGroupingDraft(actor, {
      programId: program!.id,
      weekday: 6,
      timeSlotId: slot!.id,
    });
    let workspace = await getGroupingWorkspace(actor, {
      programId: program!.id,
    });
    expect(workspace.groups).toHaveLength(2);
    expect(
      workspace.groups.every((group) => group.instructorIds.length === 0),
    ).toBe(true);
    let version = (
      await assignDraftInstructor(actor, {
        draftId: draft.id,
        baseVersion: 1,
        commandId: randomUUID(),
        groupId: workspace.groups[0]!.id,
        instructorIds: [instructorPersonId],
        leadInstructorId: instructorPersonId,
      })
    ).version;
    const neighbor = await createDraftGroup(actor, {
      draftId: draft.id,
      baseVersion: version,
      commandId: randomUUID(),
      weekday: 0,
      timeSlotId: slot!.id,
      disciplineId: discipline!.id,
      ageBandId: band!.id,
      abilityLevelId: levels[0]!.id,
    });
    version = neighbor.version;
    const command = {
      draftId: draft.id,
      baseVersion: version,
      commandId: randomUUID(),
      weekday: 6,
      timeSlotId: slot!.id,
      scope: "session" as const,
    };
    const preview = await rebuildGroupingDraft(actor, command);
    expect(preview).toMatchObject({
      oldGroups: 2,
      newGroups: 2,
      students: 3,
      clearedInstructors: 1,
      unresolved: 0,
    });
    await expect(
      rebuildGroupingDraft(actor, { ...command, previewHash: "stale" }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const rebuilt = await rebuildGroupingDraft(actor, {
      ...command,
      previewHash: preview.previewHash,
    });
    workspace = await getGroupingWorkspace(actor, { programId: program!.id });
    expect(
      workspace.groups.find((group) => group.id === neighbor.groupId),
    ).toBeTruthy();
    expect(
      workspace.groups.every((group) => group.instructorIds.length === 0),
    ).toBe(true);
    version = (
      await undoRebuild(actor, {
        draftId: draft.id,
        baseVersion: rebuilt.version,
        commandId: randomUUID(),
      })
    ).version;
    workspace = await getGroupingWorkspace(actor, { programId: program!.id });
    expect(
      workspace.groups.some(
        (group) => group.leadInstructorId === instructorPersonId,
      ),
    ).toBe(true);
    const next = { ...command, baseVersion: version, commandId: randomUUID() };
    const nextPreview = await rebuildGroupingDraft(actor, next);
    version = (
      await rebuildGroupingDraft(actor, {
        ...next,
        previewHash: nextPreview.previewHash,
      })
    ).version;
    const submitted = await submitGroupingDraft(actor, {
      draftId: draft.id,
      baseVersion: version,
    });
    version = (
      await approveGroupingDraft(actor, {
        draftId: draft.id,
        baseVersion: submitted.version,
      })
    ).version;
    await expect(
      undoRebuild(actor, {
        draftId: draft.id,
        baseVersion: version,
        commandId: randomUUID(),
      }),
    ).rejects.toThrow();
    workspace = await getGroupingWorkspace(actor, { programId: program!.id });
    const source = workspace.assignments.find(
      (item) => item.registrationId === ids[0],
    )!.draftGroupId;
    const destination = workspace.assignments.find(
      (item) => item.registrationId === ids[2],
    )!.draftGroupId;
    const change = {
      draftId: draft.id,
      baseVersion: version,
      commandId: randomUUID(),
      reason: "One lesson skill assessment",
      effectiveFrom: "2030-01-12",
      effectiveUntil: "2030-01-12",
      action: {
        type: "move" as const,
        registrationId: ids[0]!,
        fromGroupId: source,
        toGroupId: destination,
      },
    };
    const proposed = await proposeGroupChange(
      { ...actor, role: "coordinator" },
      change,
    );
    expect(proposed.status).toBe("pending");
    expect(
      (
        await getGroupLifecycle(actor, {
          draftId: draft.id,
          asOf: "2030-01-12",
        })
      ).groups.find((group) => group.id === source)!.registrationIds,
    ).toContain(ids[0]);
    await decideGroupChange(actor, { changeId: proposed.id, approve: true });
    expect(
      (
        await getGroupLifecycle(actor, {
          draftId: draft.id,
          asOf: "2030-01-12",
        })
      ).groups.find((group) => group.id === destination)!.registrationIds,
    ).toContain(ids[0]);
    expect(
      (
        await getGroupLifecycle(actor, {
          draftId: draft.id,
          asOf: "2030-01-13",
        })
      ).groups.find((group) => group.id === source)!.registrationIds,
    ).toContain(ids[0]);
    await expect(
      proposeGroupChange(actor, { ...change, commandId: randomUUID() }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      publishGroupingDraft(actor, {
        draftId: draft.id,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    // Finalization is independent of staffing; publication and future changes are not.
    const [secondInstructor] = await db
      .insert(people)
      .values({ organizationId, firstName: "Future", lastName: "Instructor" })
      .returning();
    await db.insert(instructors).values({
      personId: secondInstructor!.id,
      preferences: [
        {
          programId: program!.id,
          cohort: "season",
          weekday: 6,
          startsAt: "09:00",
          endsAt: "12:00",
          minimumAge: null,
          maximumAge: null,
          minimumLevel: null,
          maximumLevel: null,
        },
      ],
    });
    await db.insert(instructorQualifications).values({
      instructorId: secondInstructor!.id,
      disciplineId: discipline!.id,
    });
    for (const [index, groupId] of [source, destination].entries()) {
      const current = await getGroupLifecycle(actor, { draftId: draft.id });
      const instructorId =
        index === 0 ? instructorPersonId : secondInstructor!.id;
      await proposeGroupChange(actor, {
        draftId: draft.id,
        baseVersion: current.version,
        commandId: randomUUID(),
        reason: "Approved teaching assignment",
        effectiveFrom: "2030-01-01",
        effectiveUntil: null,
        action: {
          type: "staff",
          groupId,
          leadInstructorId: instructorId,
          instructorIds: [instructorId],
        },
      });
    }
    await publishGroupingDraft(actor, {
      draftId: draft.id,
      idempotencyKey: randomUUID(),
    });
    const [completed] = await db
      .select()
      .from(lessonInstances)
      .where(eq(lessonInstances.lessonDate, "2030-01-05"));
    await db
      .update(lessonInstances)
      .set({ status: "completed", notes: "Completed lesson record" })
      .where(eq(lessonInstances.id, completed!.id));
    const [member] = await db
      .select()
      .from(groupRevisionMemberships)
      .where(
        eq(
          groupRevisionMemberships.groupRevisionId,
          completed!.groupRevisionId,
        ),
      );
    await db.insert(lessonAttendance).values({
      lessonInstanceId: completed!.id,
      studentId: member!.studentId,
      status: "present",
      recordedBy: adminUserId,
    });
    const current = await getGroupLifecycle(actor, { draftId: draft.id });
    await proposeGroupChange(actor, {
      ...change,
      baseVersion: current.version,
      commandId: randomUUID(),
      effectiveFrom: "2030-01-19",
      effectiveUntil: null,
      reason: "Ongoing level adjustment",
    });
    expect(
      (
        await db
          .select()
          .from(lessonInstances)
          .where(eq(lessonInstances.id, completed!.id))
      )[0],
    ).toMatchObject({
      status: "completed",
      notes: "Completed lesson record",
      groupRevisionId: completed!.groupRevisionId,
    });
    expect(
      await db
        .select()
        .from(lessonAttendance)
        .where(eq(lessonAttendance.lessonInstanceId, completed!.id)),
    ).toHaveLength(1);
    const afterChange = await getGroupLifecycle(actor, {
      draftId: draft.id,
      asOf: "2030-01-19",
    });
    expect(
      afterChange.groups.find((group) => group.id === destination)!
        .registrationIds,
    ).toContain(ids[0]);
    expect(
      afterChange.changes
        .filter((event) => event.status === "applied")
        .every((event) => event.after?.every((group) => group.description)),
    ).toBe(true);
  });
});
