import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  listInstructorAuditHistory,
  listStudentAuditHistory,
} from "@/application/services/audit-history-service.server";
import {
  archiveInstructor,
  saveInstructor,
} from "@/application/services/instructor-service.server";
import {
  archiveStudent,
  createStudentRegistration,
  updateStudent,
} from "@/application/services/student-roster-service.server";
import {
  auditEvents,
  disciplines,
  organizationMemberships,
  organizations,
  people,
  programs,
  seasons,
  students,
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

const adminActor = {
  userId: "",
  organizationId: "",
  role: "admin" as const,
};

describe("people write transactions", () => {
  beforeAll(async () => {
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.unsafe("CREATE DATABASE carve_test");

    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });

    const [organization] = await db
      .insert(organizations)
      .values({ name: "People Write School", timezone: "America/New_York" })
      .returning({ id: organizations.id });
    if (!organization) {
      throw new Error("Unable to seed people write test organization.");
    }

    adminActor.organizationId = organization.id;
    adminActor.userId = randomUUID();

    await db.insert(users).values({
      id: adminActor.userId,
      email: "people-admin@carve.test",
      name: "People Admin",
      emailVerified: true,
    });
    await db.insert(organizationMemberships).values({
      organizationId: organization.id,
      userId: adminActor.userId,
      role: "admin",
    });

    const [season] = await db
      .insert(seasons)
      .values({
        organizationId: organization.id,
        name: "Winter 2026",
        startsOn: "2026-01-03",
        endsOn: "2026-03-22",
        status: "active",
      })
      .returning({ id: seasons.id });
    if (!season) {
      throw new Error("Unable to seed people write test season.");
    }

    const [program] = await db
      .insert(programs)
      .values({
        seasonId: season.id,
        name: "Weekend Program",
        status: "active",
      })
      .returning({ id: programs.id });
    if (!program) {
      throw new Error("Unable to seed people write test program.");
    }

    await db.insert(disciplines).values([
      {
        programId: program.id,
        key: "ski",
        label: "Ski",
        displayOrder: 1,
      },
      {
        programId: program.id,
        key: "snowboard",
        label: "Snowboard",
        displayOrder: 2,
      },
    ]);
  });

  afterAll(async () => {
    await testSql.end({ timeout: 5 });
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.end({ timeout: 5 });
  });

  test("creates a student registration with audit history", async () => {
    const result = await createStudentRegistration(adminActor, {
      firstName: "Riley",
      lastName: "Jordan",
      dateOfBirth: "2014-05-10",
      guardianName: "Alex Jordan",
      guardianPhone: "555-0101",
      guardianEmail: "alex@carve.test",
      medicalInfo: "None noted",
      notes: "Morning only",
    });

    const [student] = await db
      .select({ firstName: people.firstName, archivedAt: people.archivedAt })
      .from(students)
      .innerJoin(people, eq(students.personId, people.id))
      .where(eq(students.personId, result.studentId));
    expect(student?.firstName).toBe("Riley");
    expect(student?.archivedAt).toBeNull();

    const [registrationEvent] = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, "registration"),
          eq(auditEvents.entityId, result.registrationId),
        ),
      );
    expect(registrationEvent?.action).toBe("roster.student_registered");

    const history = await listStudentAuditHistory(adminActor, {
      studentId: result.studentId,
    });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "roster.student_registered",
          summary: "Student registered for Weekend Program",
        }),
      ]),
    );
  });

  test("updates a student and records audit history", async () => {
    const created = await createStudentRegistration(adminActor, {
      firstName: "Casey",
      lastName: "Nguyen",
      dateOfBirth: "2013-08-21",
      guardianName: "",
      guardianPhone: "555-0102",
      guardianEmail: "",
      medicalInfo: "",
      notes: "",
    });

    await updateStudent(adminActor, {
      studentId: created.studentId,
      firstName: "Casey",
      lastName: "Nguyen-Reed",
      dateOfBirth: "2013-08-21",
      guardianName: "",
      guardianPhone: "555-0102",
      guardianEmail: "",
      medicalInfo: "",
      notes: "Updated placement note",
    });

    const [student] = await db
      .select({ lastName: people.lastName })
      .from(people)
      .where(eq(people.id, created.studentId));
    expect(student?.lastName).toBe("Nguyen-Reed");

    const history = await listStudentAuditHistory(adminActor, {
      studentId: created.studentId,
    });
    expect(history[0]).toMatchObject({
      action: "roster.student_updated",
      summary: "Student updated",
    });
  });

  test("archives a student and records audit history", async () => {
    const created = await createStudentRegistration(adminActor, {
      firstName: "Jordan",
      lastName: "Lee",
      dateOfBirth: "2012-11-02",
      guardianName: "",
      guardianPhone: "",
      guardianEmail: "",
      medicalInfo: "",
      notes: "",
    });

    await archiveStudent(adminActor, { studentId: created.studentId });

    const [student] = await db
      .select({ archivedAt: people.archivedAt })
      .from(people)
      .where(eq(people.id, created.studentId));
    expect(student?.archivedAt).not.toBeNull();

    const history = await listStudentAuditHistory(adminActor, {
      studentId: created.studentId,
    });
    expect(history[0]).toMatchObject({
      action: "roster.student_archived",
      summary: "Student archived",
    });
  });

  test("creates and updates an instructor with audit history", async () => {
    const created = await saveInstructor(adminActor, {
      firstName: "Morgan",
      lastName: "Reed",
      phone: "555-0200",
      email: "morgan@carve.test",
      notes: "Lead candidate",
      disciplineKeys: ["ski"],
    });

    const [createdEvent] = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, "instructor"),
          eq(auditEvents.entityId, created.instructorId),
          eq(auditEvents.action, "roster.instructor_created"),
        ),
      );
    expect(createdEvent?.action).toBe("roster.instructor_created");

    await saveInstructor(adminActor, {
      instructorId: created.instructorId,
      firstName: "Morgan",
      lastName: "Reed",
      phone: "555-0201",
      email: "morgan@carve.test",
      notes: "Updated notes",
      disciplineKeys: ["ski", "snowboard"],
    });

    const [instructorPerson] = await db
      .select({ firstName: people.firstName })
      .from(people)
      .where(eq(people.id, created.instructorId));
    expect(instructorPerson?.firstName).toBe("Morgan");

    const history = await listInstructorAuditHistory(adminActor, {
      instructorId: created.instructorId,
    });
    expect(history[0]).toMatchObject({
      action: "roster.instructor_updated",
    });
    expect(history.at(-1)).toMatchObject({
      action: "roster.instructor_created",
    });
  });

  test("archives an instructor and records audit history", async () => {
    const created = await saveInstructor(adminActor, {
      firstName: "Taylor",
      lastName: "Brooks",
      phone: "555-0202",
      email: "",
      notes: "",
      disciplineKeys: ["snowboard"],
    });

    await archiveInstructor(adminActor, {
      instructorId: created.instructorId,
    });

    const [instructor] = await db
      .select({ archivedAt: people.archivedAt })
      .from(people)
      .where(eq(people.id, created.instructorId));
    expect(instructor?.archivedAt).not.toBeNull();

    const history = await listInstructorAuditHistory(adminActor, {
      instructorId: created.instructorId,
    });
    expect(history[0]).toMatchObject({
      action: "roster.instructor_archived",
      summary: "Instructor archived",
    });
  });
});
