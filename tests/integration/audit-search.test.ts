import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { searchRosterAuditHistory } from "@/application/services/audit-history-service.server";
import { createStudentRegistration } from "@/application/services/student-roster-service.server";
import {
  organizationMemberships,
  organizations,
  programs,
  seasons,
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

describe("roster audit search integration", () => {
  let organizationId: string;
  let adminUserId: string;
  let instructorUserId: string;
  let secondaryOrganizationId: string;
  let studentId: string;

  beforeAll(async () => {
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.unsafe("CREATE DATABASE carve_test");

    await migrate(db, {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });

    const [organization] = await db
      .insert(organizations)
      .values({ name: "Audit Search School", timezone: "America/New_York" })
      .returning({ id: organizations.id });
    const [secondaryOrganization] = await db
      .insert(organizations)
      .values({ name: "Other Audit School", timezone: "America/New_York" })
      .returning({ id: organizations.id });
    if (!organization || !secondaryOrganization) {
      throw new Error("Unable to seed audit search organizations.");
    }
    organizationId = organization.id;
    secondaryOrganizationId = secondaryOrganization.id;

    adminUserId = randomUUID();
    instructorUserId = randomUUID();
    await db.insert(users).values([
      {
        id: adminUserId,
        email: "audit-admin@carve.test",
        name: "Audit Admin",
        emailVerified: true,
      },
      {
        id: instructorUserId,
        email: "audit-instructor@carve.test",
        name: "Audit Instructor",
        emailVerified: true,
      },
    ]);
    await db.insert(organizationMemberships).values([
      {
        organizationId,
        userId: adminUserId,
        role: "admin",
      },
      {
        organizationId,
        userId: instructorUserId,
        role: "instructor",
      },
    ]);

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
    if (!season) throw new Error("Unable to seed audit search season.");

    const [program] = await db
      .insert(programs)
      .values({
        seasonId: season.id,
        name: "Weekend Program",
        status: "active",
      })
      .returning({ id: programs.id });
    if (!program) throw new Error("Unable to seed audit search program.");

    const created = await createStudentRegistration(
      {
        userId: adminUserId,
        organizationId,
        role: "admin",
      },
      {
        firstName: "Taylor",
        lastName: "Student",
        dateOfBirth: "2015-03-01",
        guardianName: "",
        guardianPhone: "",
        guardianEmail: "",
        medicalInfo: "",
        notes: "",
      },
    );
    studentId = created.studentId;
  });

  afterAll(async () => {
    await testSql.end({ timeout: 5 });
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.end({ timeout: 5 });
  });

  test("returns roster events with subject labels and supports name search", async () => {
    const results = await searchRosterAuditHistory(
      {
        userId: adminUserId,
        organizationId,
        role: "admin",
      },
      { limit: 20 },
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      entityType: "registration",
      subjectLabel: "Taylor Student",
      subjectHref: `/admin/students/${studentId}`,
    });

    const filtered = await searchRosterAuditHistory(
      {
        userId: adminUserId,
        organizationId,
        role: "admin",
      },
      { query: "Taylor", entityType: "registration" },
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.summary).toContain("Weekend Program");
  });

  test("rejects instructors and scopes results to the actor organization", async () => {
    await expect(
      searchRosterAuditHistory(
        {
          userId: instructorUserId,
          organizationId,
          role: "instructor",
        },
        {},
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const results = await searchRosterAuditHistory(
      {
        userId: adminUserId,
        organizationId: secondaryOrganizationId,
        role: "admin",
      },
      { query: "Taylor" },
    );
    expect(results).toHaveLength(0);
  });
});
