import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { Actor } from "@/application/policies/authorization";
import {
  addSurveyInvitation,
  generateSurveyInvitations,
  getPublicSurvey,
  getSurveyWorkspace,
  submitPublicSurvey,
  updateSurveyAccess,
} from "@/application/services/survey-service.server";
import {
  contactMethods,
  organizations,
  people,
  programs,
  registrations,
  seasons,
  studentGuardians,
  students,
  surveyInvitations,
  surveyResponses,
  surveys,
  users,
} from "@/db/schema";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for survey integration tests.",
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
const database = drizzle(testSql);

const answers = {
  parentEmail: "parent@example.com",
  childFirstName: "Avery",
  childLastName: "Chen",
  childDateOfBirth: "2017-01-08",
  discipline: "ski",
  session: "saturday-am-1000-1200",
  level: "level-3",
  lifts: ["surface"],
  medicalConcerns: "Peanut allergy",
  additionalInformation: "First lesson at this mountain.",
};

describe("public parent surveys", () => {
  let actor: Actor;
  let instructorActor: Actor;
  let surveyId: string;
  let programId: string;

  beforeAll(async () => {
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.unsafe("CREATE DATABASE carve_test");
    await migrate(database, {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });

    const [organization] = await database
      .insert(organizations)
      .values({ name: "Survey School", timezone: "America/New_York" })
      .returning({ id: organizations.id });
    if (!organization) throw new Error("Failed to seed survey organization.");

    const adminUserId = randomUUID();
    const instructorUserId = randomUUID();
    await database.insert(users).values([
      {
        id: adminUserId,
        email: "admin@survey.test",
        name: "Survey Admin",
        emailVerified: true,
      },
      {
        id: instructorUserId,
        email: "instructor@survey.test",
        name: "Survey Instructor",
        emailVerified: true,
      },
    ]);
    actor = {
      userId: adminUserId,
      organizationId: organization.id,
      role: "admin",
    };
    instructorActor = {
      userId: instructorUserId,
      organizationId: organization.id,
      role: "instructor",
    };

    const [season] = await database
      .insert(seasons)
      .values({
        organizationId: organization.id,
        name: "Winter 2027",
        startsOn: "2027-01-01",
        endsOn: "2027-03-31",
        status: "active",
      })
      .returning({ id: seasons.id });
    if (!season) throw new Error("Failed to seed season.");
    const [program] = await database
      .insert(programs)
      .values({
        seasonId: season.id,
        name: "Seasonal Lessons",
        status: "active",
      })
      .returning({ id: programs.id });
    if (!program) throw new Error("Failed to seed program.");
    programId = program.id;

    const [student] = await database
      .insert(people)
      .values({
        organizationId: organization.id,
        firstName: "Avery",
        lastName: "Chen",
        dateOfBirth: "2017-01-08",
      })
      .returning({ id: people.id });
    const [guardian] = await database
      .insert(people)
      .values({
        organizationId: organization.id,
        firstName: "Robin",
        lastName: "Chen",
      })
      .returning({ id: people.id });
    if (!student || !guardian) throw new Error("Failed to seed family.");
    await database.insert(students).values({ personId: student.id });
    await database.insert(registrations).values({
      studentId: student.id,
      programId: program.id,
      status: "active",
    });
    await database.insert(studentGuardians).values({
      studentId: student.id,
      guardianId: guardian.id,
    });
    await database.insert(contactMethods).values({
      personId: guardian.id,
      kind: "email",
      value: "parent@example.com",
      isPrimary: true,
    });

    const [survey] = await database
      .insert(surveys)
      .values({
        organizationId: organization.id,
        slug: "pre-lesson-test",
        title: "Pre-lesson student information",
        status: "open",
        definitionKey: "pre_lesson_intake",
        definitionVersion: 1,
        allowAnonymous: true,
      })
      .returning({ id: surveys.id });
    if (!survey) throw new Error("Failed to seed survey.");
    surveyId = survey.id;
  });

  afterAll(async () => {
    await testSql.end();
    await adminSql.end();
  });

  test("generates one invitation from current guardian emails", async () => {
    expect(programId).toBeTruthy();
    await expect(
      generateSurveyInvitations(actor, { surveyId }),
    ).resolves.toEqual({ createdCount: 1 });
    await expect(
      generateSurveyInvitations(actor, { surveyId }),
    ).resolves.toEqual({ createdCount: 0 });
  });

  test("accepts an invited response and suggests the linked student", async () => {
    const [invitation] = await database
      .select()
      .from(surveyInvitations)
      .where(eq(surveyInvitations.surveyId, surveyId));
    if (!invitation) throw new Error("Invitation was not generated.");

    await expect(
      getPublicSurvey({ slug: "pre-lesson-test", token: invitation.token }),
    ).resolves.toMatchObject({
      invited: true,
      invitationEmail: "parent@example.com",
    });
    await expect(
      submitPublicSurvey({
        slug: "pre-lesson-test",
        token: invitation.token,
        website: "",
        answers,
      }),
    ).resolves.toEqual({ accepted: true });

    const [response] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.surveyId, surveyId));
    expect(response).toMatchObject({
      matchStatus: "unique",
      childFirstName: "Avery",
      childLastName: "Chen",
    });
    expect(response?.suggestedStudentId).not.toBeNull();
  });

  test("accepts anonymous responses only while the fallback is enabled", async () => {
    await expect(
      submitPublicSurvey({
        slug: "pre-lesson-test",
        website: "",
        answers,
      }),
    ).resolves.toEqual({ accepted: true });
    const [anonymousResponse] = await database
      .select()
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          isNull(surveyResponses.invitationId),
        ),
      );
    expect(anonymousResponse).toMatchObject({
      matchStatus: "unique",
      answers: { parentEmail: "parent@example.com" },
    });

    await updateSurveyAccess(actor, {
      surveyId,
      status: "open",
      allowAnonymous: false,
    });
    await expect(
      submitPublicSurvey({
        slug: "pre-lesson-test",
        website: "",
        answers,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("allows manual invitations and protects the admin inbox", async () => {
    await addSurveyInvitation(actor, {
      surveyId,
      email: "another-parent@example.com",
    });
    await expect(getSurveyWorkspace(actor)).resolves.toMatchObject({
      survey: { id: surveyId },
    });
    await expect(getSurveyWorkspace(instructorActor)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
