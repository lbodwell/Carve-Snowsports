import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { Actor } from "@/application/policies/authorization";
import {
  confirmSurveyMatch,
  refreshSurveyMatches,
} from "@/application/services/survey-matching-service.server";
import {
  applyRegistrationImport,
  previewRegistrationImport,
  recordImportDispatchFailure,
  retryRegistrationImport,
  saveImportIdentityDecision,
} from "@/application/services/registration-import-service.server";
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
  importBatches,
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

  test("rechecks earlier responses when a student arrives and preserves confirmed links", async () => {
    await updateSurveyAccess(actor, {
      surveyId,
      status: "open",
      allowAnonymous: true,
    });
    await submitPublicSurvey({
      slug: "pre-lesson-test",
      website: "",
      answers: {
        ...answers,
        childFirstName: "Ellis",
        childLastName: "Rivera",
        childDateOfBirth: "2018-02-03",
      },
    });
    const [person] = await database
      .insert(people)
      .values({
        organizationId: actor.organizationId,
        firstName: "Ellis",
        lastName: "Rivera",
        dateOfBirth: "2018-02-03",
      })
      .returning({ id: people.id });
    await database.insert(students).values({ personId: person!.id });
    await refreshSurveyMatches(actor);
    const [response] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.childFirstName, "Ellis"));
    expect(response?.confirmedStudentId).toBe(person!.id);
    const [duplicate] = await database
      .insert(people)
      .values({
        organizationId: actor.organizationId,
        firstName: "Ellis",
        lastName: "Rivera",
        dateOfBirth: "2018-02-03",
      })
      .returning({ id: people.id });
    await database.insert(students).values({ personId: duplicate!.id });
    await refreshSurveyMatches(actor);
    const [preserved] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, response!.id));
    expect(preserved?.confirmedStudentId).toBe(person!.id);
  });

  test("links a unique name without a roster birthdate and fills it only on explicit confirmation", async () => {
    await submitPublicSurvey({
      slug: "pre-lesson-test",
      website: "",
      answers: {
        ...answers,
        childFirstName: "Skyler",
        childLastName: "Brooks",
        childDateOfBirth: "2018-04-05",
      },
    });
    const [person] = await database
      .insert(people)
      .values({
        organizationId: actor.organizationId,
        firstName: "Skyler",
        lastName: "Brooks",
      })
      .returning({ id: people.id });
    await database.insert(students).values({ personId: person!.id });
    await refreshSurveyMatches(actor);
    const [response] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.childFirstName, "Skyler"));
    expect(response?.confirmedStudentId).toBe(person!.id);
    const [beforeConfirmation] = await database
      .select()
      .from(people)
      .where(eq(people.id, person!.id));
    expect(beforeConfirmation?.dateOfBirth).toBeNull();
    await confirmSurveyMatch(actor, {
      responseId: response!.id,
      studentId: person!.id,
      fillMissingBirthDate: true,
    });
    const [updated] = await database
      .select()
      .from(people)
      .where(eq(people.id, person!.id));
    expect(updated?.dateOfBirth).toBe("2018-04-05");
    await expect(
      confirmSurveyMatch(instructorActor, {
        responseId: response!.id,
        studentId: person!.id,
        fillMissingBirthDate: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [foreignOrganization] = await database
      .insert(organizations)
      .values({ name: "Other School", timezone: "America/New_York" })
      .returning({ id: organizations.id });
    await expect(
      confirmSurveyMatch(
        { ...actor, organizationId: foreignOrganization!.id },
        {
          responseId: response!.id,
          studentId: person!.id,
          fillMissingBirthDate: false,
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("failed dispatch can be retried without clobbering an active or completed worker", async () => {
    const [batch] = await database
      .insert(importBatches)
      .values({
        organizationId: actor.organizationId,
        programId,
        sourceAdapter: "aspenware-registration",
        adapterVersion: "1",
        status: "queued",
        uploadedBy: actor.userId,
        fileHash: randomUUID(),
      })
      .returning();
    await recordImportDispatchFailure(actor, batch!.id, "reconcile");
    let [stored] = await database
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batch!.id));
    expect(stored?.status).toBe("failed");
    await retryRegistrationImport(actor, { batchId: batch!.id });
    await database
      .update(importBatches)
      .set({ status: "processing" })
      .where(eq(importBatches.id, batch!.id));
    await recordImportDispatchFailure(actor, batch!.id, "reconcile");
    [stored] = await database
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batch!.id));
    expect(stored?.status).toBe("processing");
    await database
      .update(importBatches)
      .set({ status: "applying" })
      .where(eq(importBatches.id, batch!.id));
    await recordImportDispatchFailure(actor, batch!.id, "apply");
    [stored] = await database
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batch!.id));
    expect(stored?.status).toBe("ready_for_review");
    await database
      .update(importBatches)
      .set({ status: "applied" })
      .where(eq(importBatches.id, batch!.id));
    await recordImportDispatchFailure(actor, batch!.id, "apply");
    [stored] = await database
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batch!.id));
    expect(stored?.status).toBe("applied");
  });

  test("imports reviewed Aspenware identities without duplicating people and safely reruns the batch", async () => {
    const listingCsv = [
      "DetailRowC0,CustomerName,textbox10,DetailRowC1,DetailRowC2,DetailRowC3,DetailRowC4,DetailRowC5,DetailRowC6",
      'synthetic-aspenware-avery,"Chen, Avery",9,1/1/2027,1/9/2027,1,"PM | Ski | Children\'s Seasonal Program | 26/27 | Saturday | 7-12yrs | 10am",$719.00,Type:Sale; Status:Open',
    ].join("\n");
    const input = { programId, listingCsv, listingName: "listing.csv" };
    const preview = await previewRegistrationImport(actor, input);
    expect(preview.status).toBe("ready");
    const decision = preview.identityReview[0]!;
    expect(decision.studentName).toBe("Chen, Avery");
    await expect(
      applyRegistrationImport(actor, { batchId: preview.batchId }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await saveImportIdentityDecision(actor, {
      batchId: preview.batchId,
      participantKey: decision.participantKey,
      studentId: decision.candidates[0]!.id,
    });
    const before = await database.select().from(students);
    await expect(
      applyRegistrationImport(actor, { batchId: preview.batchId }),
    ).resolves.toMatchObject({ applied: true, created: 0 });
    expect(await database.select().from(students)).toHaveLength(before.length);
    await expect(
      applyRegistrationImport(actor, { batchId: preview.batchId }),
    ).resolves.toMatchObject({ applied: false });
    expect((await previewRegistrationImport(actor, input)).batchId).toBe(
      preview.batchId,
    );
  });

  test("reconciles the three raw report formats through production remapping", async () => {
    const product =
      "PM | Ski | Children's Seasonal Program | 26/27 | Saturday | 7-12yrs | 10am";
    const preview = await previewRegistrationImport(actor, {
      programId,
      listingName: "listing.csv",
      listingCsv: [
        "DetailRowC0,CustomerName,textbox10,DetailRowC1,DetailRowC2,DetailRowC3,DetailRowC4,DetailRowC5,DetailRowC6",
        `raw-report-child,"Example, Riley",9,3/12/2026,1/9/2027,1,"${product}",$719.00,Type:Sale; Status:Open`,
      ].join("\n"),
      byOrderName: "by-order.csv",
      byOrderCsv: [
        "DetailRowC0,CustomerName,LineCustomerName,Textbox21,DetailRowC1,DetailRowC2,DetailRowC3,DetailRowC4,DetailRowC5,DetailRowC6,textbox7,PhoneNumber",
        `raw-report-purchaser,"Example, Taylor","Example, Riley",9,3/12/2026,1/9/2027,1,"${product}",$719.00,Type:Sale; Status:Open,taylor@example.test,`,
        `raw-report-purchaser,"Example, Taylor","Example, Riley",9,3/13/2026,1/9/2027,-1,"${product}",($719.00),Type:Return; Status:Open,taylor@example.test,`,
      ].join("\n"),
      promptName: "prompts.csv",
      promptCsv: [
        "TransactionID,TransactionLineIPCode,ProductDate,ProductHeaderDescription,PromptName1,PromptData1,TotalPrice",
        `raw-order,raw-report-child,1/9/2027,"${product}",Ability Level,Level 3,$719.00`,
      ].join("\n"),
    });
    expect(preview.status).toBe("ready");
    expect(preview.issues).toEqual([]);
    expect(preview.reconciliation).toMatchObject({
      promptMatched: 1,
      byOrderMatched: 1,
      active: 1,
      issueCount: 0,
    });
    expect(preview.facts[0]).toMatchObject({
      abilityLevel: "Level 3",
      issues: [],
    });
  });
});
