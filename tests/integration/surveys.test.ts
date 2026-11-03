import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { Actor } from "@/application/policies/authorization";
import {
  reviewSurveyNote,
  reviewSurveySupport,
  updateStudent,
} from "@/application/services/student-roster-service.server";
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
  getSurveyResponseDetail,
  getSurveyWorkspace,
  submitPublicSurvey,
  updateSurveyAccess,
} from "@/application/services/survey-service.server";
import {
  abilityLevels,
  auditEvents,
  contactMethods,
  disciplines,
  importBatches,
  organizations,
  people,
  programs,
  registrations,
  seasons,
  studentGuardians,
  students,
  supportRecords,
  surveyInvitations,
  surveyResponses,
  surveys,
  timeSlots,
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

  async function enrollMatchingStudent(studentId: string) {
    const [discipline] = await database
      .insert(disciplines)
      .values({ programId, key: "ski", label: "Ski" })
      .onConflictDoUpdate({
        target: [disciplines.programId, disciplines.key],
        set: { active: true },
      })
      .returning();
    const [level] = await database
      .insert(abilityLevels)
      .values({ programId, key: "level-3", label: "Level 3", numericRank: 3 })
      .onConflictDoUpdate({
        target: [abilityLevels.programId, abilityLevels.key],
        set: { active: true },
      })
      .returning();
    const [slot] = await database
      .insert(timeSlots)
      .values({
        programId,
        key: "matching-am",
        label: "Matching morning",
        startsAt: "10:00",
        endsAt: "12:00",
        allowedWeekdays: [6],
      })
      .onConflictDoUpdate({
        target: [timeSlots.programId, timeSlots.key],
        set: { active: true },
      })
      .returning();
    return (
      await database
        .insert(registrations)
        .values({
          studentId,
          programId,
          disciplineId: discipline!.id,
          abilityLevelId: level!.id,
          sourceSnapshot: {
            weekday: "Saturday",
            session: "10am",
            groupingSchedule: { weekday: 6, timeSlotId: slot!.id },
          },
        })
        .returning()
    )[0]!;
  }

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
    await enrollMatchingStudent(student.id);
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

  test("rechecks earlier responses, reviews ambiguous automatic identities and preserves staff confirmation", async () => {
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
    await enrollMatchingStudent(person!.id);
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
    expect(preserved?.confirmedStudentId).toBeNull();
    expect(preserved?.enrichmentIssues.join()).toContain(
      "Multiple students match this name",
    );
    await confirmSurveyMatch(actor, {
      responseId: response!.id,
      studentId: person!.id,
      acknowledgeConflicts: true,
    });
    await refreshSurveyMatches(actor);
    const [staffConfirmed] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, response!.id));
    expect(staffConfirmed?.confirmedStudentId).toBe(person!.id);
  });

  test("links a unique name and automatically fills a missing roster birthdate", async () => {
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
    await enrollMatchingStudent(person!.id);
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
    expect(beforeConfirmation?.dateOfBirth).toBe("2018-04-05");
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

  test("a new response fills a unique student's birthdate without a confirmation action", async () => {
    const [person] = await database
      .insert(people)
      .values({
        organizationId: actor.organizationId,
        firstName: "Automatic",
        lastName: "Birthdate",
      })
      .returning();
    await database.insert(students).values({ personId: person!.id });
    await enrollMatchingStudent(person!.id);
    await submitPublicSurvey({
      slug: "pre-lesson-test",
      website: "",
      answers: {
        ...answers,
        childFirstName: "Automatic",
        childLastName: "Birthdate",
        childDateOfBirth: "2018-06-07",
      },
    });
    const [saved] = await database
      .select()
      .from(people)
      .where(eq(people.id, person!.id));
    expect(saved?.dateOfBirth).toBe("2018-06-07");
    // A conflicting subsequent answer must neither overwrite the profile nor auto-link.
    await submitPublicSurvey({
      slug: "pre-lesson-test",
      website: "",
      answers: {
        ...answers,
        childFirstName: "Automatic",
        childLastName: "Birthdate",
        childDateOfBirth: "2019-06-07",
      },
    });
    const [conflict] = await database
      .select()
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.childFirstName, "Automatic"),
          eq(surveyResponses.childDateOfBirth, "2019-06-07"),
        ),
      );
    expect(conflict?.confirmedStudentId).toBeNull();
    const [preserved] = await database
      .select()
      .from(people)
      .where(eq(people.id, person!.id));
    expect(preserved?.dateOfBirth).toBe("2018-06-07");
  });

  test("backfills historical links, skips conflicts and unmatched responses, and preserves recorded dates", async () => {
    const family = await database
      .insert(people)
      .values([
        {
          organizationId: actor.organizationId,
          firstName: "Historical",
          lastName: "Agreed",
        },
        {
          organizationId: actor.organizationId,
          firstName: "Historical",
          lastName: "Conflict",
        },
        {
          organizationId: actor.organizationId,
          firstName: "Historical",
          lastName: "Recorded",
          dateOfBirth: "2017-01-01",
        },
        {
          organizationId: actor.organizationId,
          firstName: "Historical",
          lastName: "Unmatched",
        },
      ])
      .returning();
    await database
      .insert(students)
      .values(family.map((person) => ({ personId: person.id })));
    for (const person of family) await enrollMatchingStudent(person.id);
    const response = (index: number, date: string) => ({
      surveyId,
      answers,
      childFirstName: "Historical",
      childLastName: family[index]!.lastName,
      childDateOfBirth: date,
      confirmedStudentId: family[index]!.id,
      matchStatus: "unique" as const,
      linkSource: "staff",
    });
    await database.insert(surveyResponses).values([
      response(0, "2018-01-01"),
      response(0, "2018-01-01"),
      response(1, "2018-01-01"),
      response(1, "2019-01-01"),
      response(2, "2018-01-01"),
      {
        ...response(3, "2018-01-01"),
        confirmedStudentId: null,
        childFirstName: "Unknown",
      },
    ]);
    const backfill = await readFile(
      resolve("src/db/migrations/0016_sync-survey-birthdates.sql"),
      "utf8",
    );
    await testSql.unsafe(backfill);
    const readBirthdate = async (index: number) => {
      const [person] = await database
        .select()
        .from(people)
        .where(eq(people.id, family[index]!.id));
      return person?.dateOfBirth;
    };
    expect(await readBirthdate(0)).toBe("2018-01-01");
    expect(await readBirthdate(1)).toBeNull();
    expect(await readBirthdate(2)).toBe("2017-01-01");
    expect(await readBirthdate(3)).toBeNull();
    await testSql.unsafe(backfill); // repeat safely
    await database
      .update(people)
      .set({ dateOfBirth: null })
      .where(eq(people.id, family[0]!.id));
    await expect(refreshSurveyMatches(actor)).resolves.toMatchObject({
      birthdatesFilled: 1,
      birthdateConflicts: 1,
    });
    expect(await readBirthdate(0)).toBe("2018-01-01");
    expect(await readBirthdate(1)).toBeNull();
    const [unlinked] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.childFirstName, "Unknown"));
    await confirmSurveyMatch(actor, {
      responseId: unlinked!.id,
      studentId: family[3]!.id,
      fillMissingBirthDate: false,
      acknowledgeConflicts: true,
    });
    expect(await readBirthdate(3)).toBe("2018-01-01");
    // Even explicit confirmation cannot choose between conflicting linked dates.
    const [conflict] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.confirmedStudentId, family[1]!.id));
    await confirmSurveyMatch(actor, {
      responseId: conflict!.id,
      studentId: family[1]!.id,
      fillMissingBirthDate: true,
      acknowledgeConflicts: true,
    });
    expect(await readBirthdate(1)).toBeNull();
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

  test("already linked synchronization fills scoped registration fields and preserves attributed medical notes", async () => {
    const [discipline] = await database
      .insert(disciplines)
      .values({ programId, key: "ski", label: "Ski" })
      .onConflictDoUpdate({
        target: [disciplines.programId, disciplines.key],
        set: { active: true },
      })
      .returning();
    const [level] = await database
      .insert(abilityLevels)
      .values({ programId, key: "level-3", label: "Level 3", numericRank: 3 })
      .onConflictDoUpdate({
        target: [abilityLevels.programId, abilityLevels.key],
        set: { active: true },
      })
      .returning();
    const [slot] = await database
      .insert(timeSlots)
      .values({
        programId,
        key: "enrichment-am",
        label: "Morning",
        startsAt: "10:00",
        endsAt: "12:00",
        allowedWeekdays: [6],
      })
      .returning();
    const [person] = await database
      .insert(people)
      .values({
        organizationId: actor.organizationId,
        firstName: "Sync",
        lastName: "Fixture",
      })
      .returning();
    await database.insert(students).values({ personId: person!.id });
    const [registration] = await database
      .insert(registrations)
      .values({
        programId,
        studentId: person!.id,
        sourceSnapshot: {
          groupingSchedule: { weekday: 6, timeSlotId: slot!.id },
        },
      })
      .returning();
    const [response] = await database
      .insert(surveyResponses)
      .values({
        surveyId,
        childFirstName: "Sync",
        childLastName: "Fixture",
        childDateOfBirth: "2017-01-08",
        confirmedStudentId: person!.id,
        matchStatus: "unique",
        linkSource: "staff",
        answers: {
          ...answers,
          childFirstName: "Sync",
          childLastName: "Fixture",
        },
      })
      .returning();
    await database.insert(supportRecords).values({
      studentId: person!.id,
      category: "special_condition",
      restrictedNote: "Staff authored note",
    });
    await refreshSurveyMatches(actor);
    await refreshSurveyMatches(actor);
    const [saved] = await database
      .select()
      .from(registrations)
      .where(eq(registrations.id, registration!.id));
    expect(saved).toMatchObject({
      disciplineId: discipline!.id,
      abilityLevelId: level!.id,
    });
    expect(
      (
        await database.select().from(people).where(eq(people.id, person!.id))
      )[0]!.dateOfBirth,
    ).toBe("2017-01-08");
    let notes = await database
      .select()
      .from(supportRecords)
      .where(eq(supportRecords.studentId, person!.id));
    expect(notes).toHaveLength(2);
    expect(
      notes.find((note) => note.sourceResponseId === response!.id),
    ).toMatchObject({
      restrictedNote: answers.medicalConcerns,
      requiresReview: true,
    });
    await reviewSurveySupport(actor, {
      studentId: person!.id,
      responseId: response!.id,
      requiresReview: false,
    });
    await updateStudent(actor, {
      studentId: person!.id,
      registrationId: registration!.id,
      firstName: "Sync",
      lastName: "Fixture",
      dateOfBirth: "2017-01-08",
      disciplineId: discipline!.id,
      abilityLevelId: level!.id,
      guardianName: "",
      guardianPhone: "",
      guardianEmail: "",
      medicalInfo: "Revised staff note",
      notes: "Placement note",
    });
    await refreshSurveyMatches(actor);
    notes = await database
      .select()
      .from(supportRecords)
      .where(eq(supportRecords.studentId, person!.id));
    expect(notes).toHaveLength(2);
    expect(
      notes.find((note) => note.sourceResponseId === response!.id),
    ).toMatchObject({
      restrictedNote: answers.medicalConcerns,
      requiresReview: false,
    });
    expect(notes.find((note) => !note.sourceResponseId)!.restrictedNote).toBe(
      "Revised staff note",
    );
    await reviewSurveySupport(actor, {
      studentId: person!.id,
      responseId: response!.id,
      requiresReview: false,
      dismissed: true,
    });
    await reviewSurveyNote(actor, {
      responseId: response!.id,
      kind: "placement",
      status: "dismissed",
    });
    await refreshSurveyMatches(actor);
    const [hidden] = await database
      .select()
      .from(supportRecords)
      .where(eq(supportRecords.sourceResponseId, response!.id));
    expect(hidden).toMatchObject({ active: false, requiresReview: false });
    const [reviewedResponse] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, response!.id));
    expect(reviewedResponse!.noteReview).toEqual({
      medical: "dismissed",
      placement: "dismissed",
    });
    await reviewSurveyNote(actor, {
      responseId: response!.id,
      kind: "medical",
      status: "pending",
    });
    const [restored] = await database
      .select()
      .from(supportRecords)
      .where(eq(supportRecords.sourceResponseId, response!.id));
    expect(restored).toMatchObject({ active: true, requiresReview: true });
    await expect(
      reviewSurveyNote(instructorActor, {
        responseId: response!.id,
        kind: "placement",
        status: "dismissed",
      }),
    ).rejects.toThrow();
    await expect(
      reviewSurveySupport(instructorActor, {
        studentId: person!.id,
        responseId: response!.id,
        requiresReview: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("response pagination spans every result, preserves stable ordering, and loads medical answers only in detail", async () => {
    const [survey] = await database
      .insert(surveys)
      .values({
        organizationId: actor.organizationId,
        slug: "pagination-fixture",
        title: "Pagination fixture",
        definitionKey: "pre_lesson_intake",
        definitionVersion: 1,
        status: "open",
      })
      .returning();
    await database.insert(surveyResponses).values(
      Array.from({ length: 56 }, (_, index) => ({
        surveyId: survey!.id,
        childFirstName: "Page" + index,
        childLastName: "Fixture",
        childDateOfBirth: answers.childDateOfBirth,
        submittedAt: new Date("2030-01-01T12:00:00Z"),
        answers: {
          ...answers,
          childFirstName: "Page" + index,
          childLastName: "Fixture",
        },
      })),
    );
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        getSurveyWorkspace(actor, { surveyId: survey!.id, page, pageSize: 25 }),
      ),
    );
    expect(pages.map((page) => page.responses.length)).toEqual([25, 25, 6]);
    expect(
      new Set(
        pages.flatMap((page) => page.responses.map((response) => response.id)),
      ).size,
    ).toBe(56);
    expect(pages[0]!.responseTotal).toBe(56);
    expect(pages[0]!.responses[0]!.answers).not.toHaveProperty(
      "medicalConcerns",
    );
    expect(
      (await getSurveyWorkspace(actor, { surveyId: survey!.id, q: "Page55" }))
        .responses,
    ).toHaveLength(1);
    expect(
      (await getSurveyResponseDetail(actor, pages[0]!.responses[0]!.id)).answers
        .medicalConcerns,
    ).toBe(answers.medicalConcerns);
  });
  test("queues new and historical conflicts, scopes review by program, and preserves staff decisions", async () => {
    const [person] = await database
      .insert(people)
      .values({
        organizationId: actor.organizationId,
        firstName: "Review",
        lastName: "Evidence",
        dateOfBirth: answers.childDateOfBirth,
      })
      .returning();
    await database.insert(students).values({ personId: person!.id });
    const registration = await enrollMatchingStudent(person!.id);
    await database
      .insert(abilityLevels)
      .values({ programId, key: "level-4", label: "Level 4", numericRank: 4 })
      .onConflictDoNothing();
    await submitPublicSurvey({
      slug: "pre-lesson-test",
      website: "",
      answers: {
        ...answers,
        childFirstName: "Review",
        childLastName: "Evidence",
        level: "level-4",
      },
    });
    let [response] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.childFirstName, "Review"));
    expect(response!.confirmedStudentId).toBeNull();
    expect(response!.suggestedStudentId).toBe(person!.id);
    expect(response!.enrichmentIssues.join()).toContain("Level conflicts");
    expect(
      (
        await getSurveyWorkspace(actor, { link: "review", programId })
      ).responses.some((item) => item.id === response!.id),
    ).toBe(true);
    // Simulate an earlier automatic link that bypassed enrollment assessment.
    await database
      .update(surveyResponses)
      .set({ confirmedStudentId: person!.id, linkSource: "automatic" })
      .where(eq(surveyResponses.id, response!.id));
    await refreshSurveyMatches(actor);
    [response] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, response!.id));
    expect(response!.confirmedStudentId).toBeNull();
    await expect(
      confirmSurveyMatch(actor, {
        responseId: response!.id,
        studentId: person!.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await confirmSurveyMatch(actor, {
      responseId: response!.id,
      studentId: person!.id,
      acknowledgeConflicts: true,
    });
    await refreshSurveyMatches(actor);
    [response] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, response!.id));
    expect(response).toMatchObject({
      confirmedStudentId: person!.id,
      linkSource: "staff",
      enrichmentIssues: [],
    });
    expect(
      (
        await database
          .select()
          .from(registrations)
          .where(eq(registrations.id, registration.id))
      )[0]!.abilityLevelId,
    ).toBe(registration.abilityLevelId);
    await database
      .update(people)
      .set({ dateOfBirth: "2016-02-03" })
      .where(eq(people.id, person!.id));
    await refreshSurveyMatches(actor);
    [response] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, response!.id));
    expect(response!.confirmedStudentId).toBe(person!.id);
    expect(response!.enrichmentIssues.join()).toContain("Birthdates differ");
    const review = await getSurveyWorkspace(actor, {
      link: "review",
      programId,
      q: "Review Evidence",
    });
    expect(review.responses.map((item) => item.id)).toContain(response!.id);
    expect(review.responseTotal).toBe(1);
    expect(review.reviewTotal).toBe(1);
  });
  test("revalidates clean historical links automatically, removes migration flags and records fresh provenance", async () => {
    for (const source of ["unknown", "automatic", "staff"]) {
      const [person] = await database
        .insert(people)
        .values({
          organizationId: actor.organizationId,
          firstName: "CleanHistorical",
          lastName: source,
          dateOfBirth: answers.childDateOfBirth,
        })
        .returning();
      await database.insert(students).values({ personId: person!.id });
      await enrollMatchingStudent(person!.id);
      const [response] = await database
        .insert(surveyResponses)
        .values({
          surveyId,
          confirmedStudentId: person!.id,
          linkSource: source,
          matchStatus: "unique",
          childFirstName: "CleanHistorical",
          childLastName: source,
          childDateOfBirth: answers.childDateOfBirth,
          answers: {
            ...answers,
            childFirstName: "CleanHistorical",
            childLastName: source,
          },
          enrichmentIssues: [
            "Existing response requires enrollment assessment; run Re-link and sync.",
          ],
        })
        .returning();
      await refreshSurveyMatches(actor);
      await refreshSurveyMatches(actor);
      const [saved] = await database
        .select()
        .from(surveyResponses)
        .where(eq(surveyResponses.id, response!.id));
      expect(saved).toMatchObject({
        confirmedStudentId: person!.id,
        linkSource: source === "staff" ? "staff" : "automatic",
        enrichmentIssues: [],
      });
      const queue = await getSurveyWorkspace(actor, {
        link: "review",
        q: `CleanHistorical ${source}`,
      });
      expect(queue.responses).toEqual([]);
      expect(queue.responseTotal).toBe(0);
      expect(queue.reviewTotal).toBe(0);
      const audit = await database
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, response!.id));
      expect(
        audit.filter((event) => event.action === "survey.match_revalidated"),
      ).toHaveLength(source === "unknown" ? 1 : 0);
    }
  });
  test("staff field decisions update only the selected registration, persist through reconciliation, and reject stale evidence", async () => {
    const [person] = await database
      .insert(people)
      .values({
        organizationId: actor.organizationId,
        firstName: "RosterFirst",
        lastName: "RosterLast",
        dateOfBirth: answers.childDateOfBirth,
      })
      .returning();
    await database.insert(students).values({ personId: person!.id });
    const registration = await enrollMatchingStudent(person!.id);
    const otherRegistration = await enrollMatchingStudent(person!.id);
    const [snowboard] = await database
      .insert(disciplines)
      .values({ programId, key: "snowboard", label: "Snowboard" })
      .onConflictDoUpdate({
        target: [disciplines.programId, disciplines.key],
        set: { active: true },
      })
      .returning();
    const [level] = await database
      .insert(abilityLevels)
      .values({ programId, key: "level-4", label: "Level 4", numericRank: 4 })
      .onConflictDoUpdate({
        target: [abilityLevels.programId, abilityLevels.key],
        set: { active: true },
      })
      .returning();
    const [slot] = await database
      .insert(timeSlots)
      .values({
        programId,
        key: "review-thursday-2",
        label: "Session 2",
        cohort: "session-2",
        startsAt: "09:30",
        endsAt: "11:00",
        allowedWeekdays: [4, 5],
      })
      .returning();
    await submitPublicSurvey({
      slug: "pre-lesson-test",
      website: "",
      answers: {
        ...answers,
        childFirstName: "SurveyFirst",
        childLastName: "SurveyLast",
        discipline: "snowboard",
        level: "level-4",
        session: "thursday-am-0930-1100-session-2",
      },
    });
    const [response] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.childFirstName, "SurveyFirst"));
    const detail = await getSurveyResponseDetail(actor, response!.id);
    const input = {
      responseId: response!.id,
      studentId: person!.id,
      registrationId: registration.id,
      reviewEvidenceKey: detail.students.find(
        (item) => item.studentId === person!.id,
      )!.reviewEvidenceKey,
      acknowledgeConflicts: true,
      fieldDecisions: {
        firstName: "use-survey",
        lastName: "keep-roster",
        level: "use-survey",
        discipline: "use-survey",
        session: "use-survey",
      } as const,
    };
    await expect(
      confirmSurveyMatch(actor, { ...input, acknowledgeConflicts: false }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      confirmSurveyMatch(actor, { ...input, reviewEvidenceKey: undefined }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      confirmSurveyMatch(actor, { ...input, reviewEvidenceKey: "stale" }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      confirmSurveyMatch(instructorActor, input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      confirmSurveyMatch(actor, { ...input, registrationId: randomUUID() }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    // A failed enrollment validation rolls back the profile changes as well.
    await database
      .update(timeSlots)
      .set({ active: false })
      .where(eq(timeSlots.id, slot!.id));
    const unavailableDetail = await getSurveyResponseDetail(
      actor,
      response!.id,
    );
    await expect(
      confirmSurveyMatch(actor, {
        ...input,
        reviewEvidenceKey: unavailableDetail.students.find(
          (item) => item.studentId === person!.id,
        )!.reviewEvidenceKey,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const [unchangedPerson] = await database
      .select()
      .from(people)
      .where(eq(people.id, person!.id));
    expect(unchangedPerson!.firstName).toBe("RosterFirst");
    await database
      .update(timeSlots)
      .set({ active: true })
      .where(eq(timeSlots.id, slot!.id));
    await confirmSurveyMatch(actor, input);
    await refreshSurveyMatches(actor);
    const [updated] = await database
      .select()
      .from(registrations)
      .where(eq(registrations.id, registration.id));
    expect(updated).toMatchObject({
      disciplineId: snowboard!.id,
      abilityLevelId: level!.id,
      sourceSnapshot: {
        weekday: "Thursday",
        session: "Session 2",
        groupingSchedule: { weekday: 4, timeSlotId: slot!.id },
      },
    });
    const [other] = await database
      .select()
      .from(registrations)
      .where(eq(registrations.id, otherRegistration.id));
    expect(other).toEqual(otherRegistration);
    const [updatedPerson] = await database
      .select()
      .from(people)
      .where(eq(people.id, person!.id));
    expect(updatedPerson).toMatchObject({
      firstName: "SurveyFirst",
      lastName: "RosterLast",
    });
    const [saved] = await database
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, response!.id));
    expect(saved!.enrichmentIssues).toEqual([]);
    expect(saved!.reviewAcknowledgement).toMatchObject({
      fieldDecisions: input.fieldDecisions,
      registrationId: registration.id,
    });
    // Reusing evidence after a name/level update cannot apply another override.
    await expect(confirmSurveyMatch(actor, input)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    const audit = await database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, response!.id));
    expect(
      audit.find((event) => event.action === "survey.match_confirmed")!
        .metadata,
    ).toMatchObject({
      fieldDecisions: input.fieldDecisions,
      registrationId: registration.id,
    });
  });
  test("staff can retain or replace a conflicting birthdate with a recorded, current decision", async () => {
    for (const decision of ["keep-roster", "use-survey"] as const) {
      const [person] = await database
        .insert(people)
        .values({
          organizationId: actor.organizationId,
          firstName: "BirthdateChoice",
          lastName: decision,
          dateOfBirth: "2016-01-08",
        })
        .returning();
      await database.insert(students).values({ personId: person!.id });
      await enrollMatchingStudent(person!.id);
      await submitPublicSurvey({
        slug: "pre-lesson-test",
        website: "",
        answers: {
          ...answers,
          childFirstName: "BirthdateChoice",
          childLastName: decision,
        },
      });
      const [response] = await database
        .select()
        .from(surveyResponses)
        .where(
          and(
            eq(surveyResponses.childFirstName, "BirthdateChoice"),
            eq(surveyResponses.childLastName, decision),
          ),
        );
      expect(response!.confirmedStudentId).toBeNull();
      const detail = await getSurveyResponseDetail(actor, response!.id);
      const evidence = detail.students.find(
        (item) => item.studentId === person!.id,
      )!.reviewEvidenceKey;
      const input = {
        responseId: response!.id,
        studentId: person!.id,
        birthdateDecision: decision,
        reviewEvidenceKey: evidence,
      };
      await expect(confirmSurveyMatch(actor, input)).rejects.toMatchObject({
        code: "VALIDATION",
      });
      await expect(
        confirmSurveyMatch(actor, {
          ...input,
          acknowledgeConflicts: true,
          reviewEvidenceKey: "stale",
        }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      if (decision === "use-survey")
        await expect(
          confirmSurveyMatch(actor, {
            ...input,
            acknowledgeConflicts: true,
            reviewEvidenceKey: undefined,
          }),
        ).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(
        confirmSurveyMatch(instructorActor, {
          ...input,
          acknowledgeConflicts: true,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await confirmSurveyMatch(actor, { ...input, acknowledgeConflicts: true });
      await refreshSurveyMatches(actor);
      await refreshSurveyMatches(actor);
      const [saved] = await database
        .select()
        .from(surveyResponses)
        .where(eq(surveyResponses.id, response!.id));
      expect(saved!.enrichmentIssues).toEqual([]);
      expect(saved!.reviewAcknowledgement?.birthdateDecision).toMatchObject({
        action: decision,
        previousDateOfBirth: "2016-01-08",
        surveyDateOfBirth: answers.childDateOfBirth,
      });
      const [child] = await database
        .select()
        .from(people)
        .where(eq(people.id, person!.id));
      expect(child!.dateOfBirth).toBe(
        decision === "use-survey" ? answers.childDateOfBirth : "2016-01-08",
      );
      const audit = await database
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, response!.id));
      expect(
        audit.find((event) => event.action === "survey.match_confirmed")!
          .metadata,
      ).toMatchObject({
        birthdateDecision: decision,
        previousDateOfBirth: "2016-01-08",
      });
    }
  });
  test("backfills link provenance from audit history and reopens only conflicting automatic links", async () => {
    const cases = [];
    for (const source of ["automatic", "staff", "unknown"]) {
      const [person] = await database
        .insert(people)
        .values({
          organizationId: actor.organizationId,
          firstName: "Provenance",
          lastName: source,
          dateOfBirth: "2017-01-08",
        })
        .returning();
      await database.insert(students).values({ personId: person!.id });
      await enrollMatchingStudent(person!.id);
      const [response] = await database
        .insert(surveyResponses)
        .values({
          surveyId,
          confirmedStudentId: person!.id,
          matchStatus: "unique",
          childFirstName: "Provenance",
          childLastName: source,
          childDateOfBirth: "2016-01-08",
          answers: {
            ...answers,
            childFirstName: "Provenance",
            childLastName: source,
            childDateOfBirth: "2016-01-08",
          },
        })
        .returning();
      if (source !== "unknown")
        await database.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorId: null,
          entityType: "survey_response",
          entityId: response!.id,
          action: "submitted",
          metadata: { matchStatus: "unique" },
        });
      if (source === "staff")
        await database.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          entityType: "survey_response",
          entityId: response!.id,
          action: "survey.match_confirmed",
          metadata: { studentId: person!.id },
        });
      cases.push({ source, studentId: person!.id, responseId: response!.id });
    }
    const migration = await readFile(
      resolve("src/db/migrations/0021_survey-review-provenance.sql"),
      "utf8",
    );
    await testSql.unsafe(
      migration.split("--> statement-breakpoint").slice(3).join("\n"),
    );
    await refreshSurveyMatches(actor);
    await refreshSurveyMatches(actor);
    for (const item of cases) {
      const [response] = await database
        .select()
        .from(surveyResponses)
        .where(eq(surveyResponses.id, item.responseId));
      expect(response!.linkSource).toBe(item.source);
      expect(response!.confirmedStudentId).toBe(
        item.source === "automatic" ? null : item.studentId,
      );
      expect(response!.enrichmentIssues.join()).toContain("Birthdates differ");
      if (item.source === "unknown")
        expect(response!.enrichmentIssues.join()).toContain("origin");
      expect(
        (
          await database
            .select()
            .from(people)
            .where(eq(people.id, item.studentId))
        )[0]!.dateOfBirth,
      ).toBe("2017-01-08");
    }
  });
});
