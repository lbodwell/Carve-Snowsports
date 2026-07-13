import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  approveGroupingDraft,
  assignDraftInstructor,
  createGroupingDraft,
  publishGroupingDraft,
  submitGroupingDraft,
} from "@/application/services/grouping-draft-service.server";
import {
  getInstructorLessonSchedule,
  getLessonInstanceRoster,
} from "@/application/services/lesson-service.server";
import {
  abilityLevels,
  ageBands,
  disciplines,
  groupingDraftGroups,
  instructorQualifications,
  instructors,
  lessonInstances,
  organizationMemberships,
  organizations,
  people,
  programs,
  registrations,
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

describe("lesson authorization integration", () => {
  let organizationId: string;
  let programId: string;
  let assignedInstructorUserId: string;
  let assignedInstructorPersonId: string;
  let otherInstructorUserId: string;
  let lessonInstanceId: string;

  beforeAll(async () => {
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.unsafe("CREATE DATABASE carve_test");

    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });

    const [organization] = await db
      .insert(organizations)
      .values({ name: "Lesson School", timezone: "America/New_York" })
      .returning({ id: organizations.id });
    if (!organization) throw new Error("Unable to seed lesson organization.");
    organizationId = organization.id;

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
    if (!season) throw new Error("Unable to seed lesson season.");

    const [program] = await db
      .insert(programs)
      .values({
        seasonId: season.id,
        name: "Weekend Program",
        status: "active",
      })
      .returning({ id: programs.id });
    if (!program) throw new Error("Unable to seed lesson program.");
    programId = program.id;

    const configuredDisciplines = await db
      .insert(disciplines)
      .values([{ programId, key: "ski", label: "Ski", displayOrder: 1 }])
      .returning();
    await db.insert(abilityLevels).values({
      programId,
      key: "level-2",
      label: "Level 2",
      numericRank: 2,
      displayOrder: 2,
    });
    await db.insert(ageBands).values({
      programId,
      label: "Ages 7–12",
      minimumAge: 7,
      maximumAge: 12,
      displayOrder: 1,
    });
    await db.insert(timeSlots).values({
      programId,
      key: "am",
      label: "Morning",
      startsAt: "09:00",
      endsAt: "12:00",
      displayOrder: 1,
    });

    assignedInstructorUserId = randomUUID();
    otherInstructorUserId = randomUUID();
    await db.insert(users).values([
      {
        id: assignedInstructorUserId,
        email: "assigned-instructor@carve.test",
        name: "Assigned Instructor",
        emailVerified: true,
      },
      {
        id: otherInstructorUserId,
        email: "other-instructor@carve.test",
        name: "Other Instructor",
        emailVerified: true,
      },
    ]);
    await db.insert(organizationMemberships).values([
      {
        organizationId,
        userId: assignedInstructorUserId,
        role: "instructor",
      },
      {
        organizationId,
        userId: otherInstructorUserId,
        role: "instructor",
      },
    ]);

    const [assignedPerson] = await db
      .insert(people)
      .values({
        organizationId,
        firstName: "Jordan",
        lastName: "Lee",
      })
      .returning({ id: people.id });
    const [otherPerson] = await db
      .insert(people)
      .values({
        organizationId,
        firstName: "Casey",
        lastName: "Nguyen",
      })
      .returning({ id: people.id });
    if (!assignedPerson || !otherPerson) {
      throw new Error("Unable to seed lesson instructors.");
    }
    assignedInstructorPersonId = assignedPerson.id;
    await db.insert(instructors).values([
      {
        personId: assignedPerson.id,
        userId: assignedInstructorUserId,
      },
      {
        personId: otherPerson.id,
        userId: otherInstructorUserId,
      },
    ]);
    await db.insert(instructorQualifications).values([
      {
        instructorId: assignedPerson.id,
        disciplineId: configuredDisciplines[0]!.id,
      },
      {
        instructorId: otherPerson.id,
        disciplineId: configuredDisciplines[0]!.id,
      },
    ]);

    const [studentPerson] = await db
      .insert(people)
      .values({
        organizationId,
        firstName: "Taylor",
        lastName: "Student",
        dateOfBirth: "2016-03-01",
      })
      .returning({ id: people.id });
    if (!studentPerson) throw new Error("Unable to seed lesson student.");
    await db.insert(students).values({ personId: studentPerson.id });
    await db.insert(registrations).values({
      studentId: studentPerson.id,
      programId,
      status: "active",
      disciplineId: configuredDisciplines[0]!.id,
    });

    const adminUserId = randomUUID();
    await db.insert(users).values({
      id: adminUserId,
      email: "lesson-admin@carve.test",
      name: "Lesson Admin",
      emailVerified: true,
    });
    await db.insert(organizationMemberships).values({
      organizationId,
      userId: adminUserId,
      role: "admin",
    });

    const adminActor = {
      userId: adminUserId,
      organizationId,
      role: "admin" as const,
    };
    const draft = await createGroupingDraft(adminActor, { programId });
    const groups = await db
      .select({ id: groupingDraftGroups.id })
      .from(groupingDraftGroups)
      .where(eq(groupingDraftGroups.draftId, draft.id));

    let draftVersion = 1;
    for (const group of groups) {
      const assigned = await assignDraftInstructor(adminActor, {
        draftId: draft.id,
        baseVersion: draftVersion,
        commandId: randomUUID(),
        groupId: group.id,
        instructorIds: [assignedInstructorPersonId],
        leadInstructorId: assignedInstructorPersonId,
      });
      draftVersion = assigned.version;
    }

    const submitted = await submitGroupingDraft(adminActor, {
      draftId: draft.id,
      baseVersion: draftVersion,
    });
    const approved = await approveGroupingDraft(adminActor, {
      draftId: draft.id,
      baseVersion: submitted.version,
    });
    await publishGroupingDraft(adminActor, {
      draftId: draft.id,
      idempotencyKey: randomUUID(),
    });

    const [lesson] = await db
      .select({ id: lessonInstances.id })
      .from(lessonInstances)
      .orderBy(asc(lessonInstances.lessonDate))
      .limit(1);
    if (!lesson) throw new Error("Unable to seed lesson instance.");
    lessonInstanceId = lesson.id;
    void approved;
  });

  afterAll(async () => {
    await testSql.end({ timeout: 5 });
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.end({ timeout: 5 });
  });

  test("assigned instructors can read their lesson schedule and roster", async () => {
    const actor = {
      userId: assignedInstructorUserId,
      organizationId,
      role: "instructor" as const,
    };

    const schedule = await getInstructorLessonSchedule(actor);
    expect(schedule.lessons.length).toBeGreaterThan(0);
    expect(schedule.lessons.some((lesson) => lesson.id === lessonInstanceId)).toBe(
      true,
    );

    const roster = await getLessonInstanceRoster(actor, {
      lessonInstanceId,
    });
    expect(roster.lesson.id).toBe(lessonInstanceId);
    expect(roster.roster).toHaveLength(1);
    expect(roster.roster[0]).toMatchObject({
      firstName: "Taylor",
      lastName: "Student",
      disciplineLabel: "Ski",
    });
    expect(roster.roster[0]).not.toHaveProperty("medicalInfo");
    expect(roster.roster[0]).not.toHaveProperty("guardianEmail");
  });

  test("other instructors cannot read another instructor's lesson roster", async () => {
    await expect(
      getLessonInstanceRoster(
        {
          userId: otherInstructorUserId,
          organizationId,
          role: "instructor",
        },
        { lessonInstanceId },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("admins cannot use instructor lesson roster reads", async () => {
    await expect(
      getInstructorLessonSchedule({
        userId: randomUUID(),
        organizationId,
        role: "admin",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
