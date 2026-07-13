import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createGroupingDraft } from "@/application/services/grouping-draft-service.server";
import { saveInstructor } from "@/application/services/instructor-service.server";
import { updateStudent } from "@/application/services/student-roster-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";
import {
  accounts,
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

describe("authorization integration", () => {
  let primaryOrganizationId: string;
  let secondaryOrganizationId: string;
  let studentInPrimaryOrgId: string;
  let userInSecondaryOrgId: string;
  let instructorInPrimaryOrgId: string;
  let programInPrimaryOrgId: string;

  beforeAll(async () => {
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.unsafe("CREATE DATABASE carve_test");

    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });

    const [primaryOrganization] = await db
      .insert(organizations)
      .values({ name: "Primary School", timezone: "America/New_York" })
      .returning({ id: organizations.id });
    const [secondaryOrganization] = await db
      .insert(organizations)
      .values({ name: "Secondary School", timezone: "America/New_York" })
      .returning({ id: organizations.id });

    if (!primaryOrganization || !secondaryOrganization) {
      throw new Error("Unable to seed authorization test organizations.");
    }

    primaryOrganizationId = primaryOrganization.id;
    secondaryOrganizationId = secondaryOrganization.id;

    const [studentPerson] = await db
      .insert(people)
      .values({
        organizationId: primaryOrganizationId,
        firstName: "Taylor",
        lastName: "Student",
        dateOfBirth: "2015-03-01",
      })
      .returning({ id: people.id });
    if (!studentPerson) {
      throw new Error("Unable to seed authorization test student.");
    }

    await db.insert(students).values({ personId: studentPerson.id });
    studentInPrimaryOrgId = studentPerson.id;

    userInSecondaryOrgId = randomUUID();
    await db.insert(users).values({
      id: userInSecondaryOrgId,
      email: "secondary-staff@carve.test",
      name: "Secondary Staff",
      emailVerified: true,
    });
    await db.insert(organizationMemberships).values({
      organizationId: secondaryOrganizationId,
      userId: userInSecondaryOrgId,
      role: "admin",
    });

    instructorInPrimaryOrgId = randomUUID();
    await db.insert(users).values({
      id: instructorInPrimaryOrgId,
      email: "instructor@carve.test",
      name: "Primary Instructor",
      emailVerified: true,
    });
    await db.insert(organizationMemberships).values({
      organizationId: primaryOrganizationId,
      userId: instructorInPrimaryOrgId,
      role: "instructor",
    });
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: instructorInPrimaryOrgId,
      providerId: "credential",
      userId: instructorInPrimaryOrgId,
      password: await hashPassword("instructor-test-password"),
    });

    const [season] = await db
      .insert(seasons)
      .values({
        organizationId: primaryOrganizationId,
        name: "Winter 2026",
        startsOn: "2026-01-03",
        endsOn: "2026-03-22",
        status: "active",
      })
      .returning({ id: seasons.id });
    if (!season) {
      throw new Error("Unable to seed authorization test season.");
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
      throw new Error("Unable to seed authorization test program.");
    }
    programInPrimaryOrgId = program.id;

    await db.insert(disciplines).values({
      programId: program.id,
      key: "ski",
      label: "Ski",
      displayOrder: 1,
    });
  });

  afterAll(async () => {
    await testSql.end({ timeout: 5 });
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.end({ timeout: 5 });
  });

  test("resolveActor rejects anonymous requests", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousImpersonation = process.env.DEV_IMPERSONATE_USER_EMAIL;

    process.env.NODE_ENV = "production";
    delete process.env.DEV_IMPERSONATE_USER_EMAIL;

    await expect(
      resolveActor({ headers: new Headers() }),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    process.env.NODE_ENV = previousNodeEnv;
    if (previousImpersonation) {
      process.env.DEV_IMPERSONATE_USER_EMAIL = previousImpersonation;
    }
  });

  test("student writes are scoped to the actor organization", async () => {
    await expect(
      updateStudent(
        {
          userId: userInSecondaryOrgId,
          organizationId: secondaryOrganizationId,
          role: "admin",
        },
        {
          studentId: studentInPrimaryOrgId,
          firstName: "Taylor",
          lastName: "Student",
          dateOfBirth: "2015-03-01",
          guardianName: "",
          guardianPhone: "",
          guardianEmail: "",
          medicalInfo: "",
          notes: "",
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const [student] = await db
      .select({ firstName: people.firstName })
      .from(people)
      .where(eq(people.id, studentInPrimaryOrgId));

    expect(student?.firstName).toBe("Taylor");
  });

  test("instructors cannot write to the instructor roster", async () => {
    await expect(
      saveInstructor(
        {
          userId: instructorInPrimaryOrgId,
          organizationId: primaryOrganizationId,
          role: "instructor",
        },
        {
          firstName: "Alex",
          lastName: "Rivera",
          phone: "555-0100",
          email: "",
          notes: "",
          disciplineKeys: ["ski"],
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("instructors cannot create grouping drafts", async () => {
    await expect(
      createGroupingDraft(
        {
          userId: instructorInPrimaryOrgId,
          organizationId: primaryOrganizationId,
          role: "instructor",
        },
        {
          programId: programInPrimaryOrgId,
        },
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("grouping writes stay scoped to the actor organization", async () => {
    await expect(
      createGroupingDraft(
        {
          userId: userInSecondaryOrgId,
          organizationId: secondaryOrganizationId,
          role: "admin",
        },
        {
          programId: programInPrimaryOrgId,
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
