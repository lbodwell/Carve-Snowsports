import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
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
  abilityLevels,
  ageBands,
  auditEvents,
  disciplines,
  groupRevisionMemberships,
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
      .select({ version: groupingDrafts.version, status: groupingDrafts.status })
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

    const memberships = await db
      .select()
      .from(groupRevisionMemberships);
    expect(memberships.length).toBeGreaterThan(0);

    const [finalDraft] = await db
      .select({ status: groupingDrafts.status, publishedAt: groupingDrafts.publishedAt })
      .from(groupingDrafts)
      .where(eq(groupingDrafts.id, draft.id));
    expect(finalDraft?.status).toBe("published");
    expect(finalDraft?.publishedAt).toBeTruthy();
  });
});
