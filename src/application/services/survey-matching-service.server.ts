import { and, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import type { SurveyAssessmentContext } from "@/domain/surveys/response-assessment";
import { requirePermission } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { db } from "@/db/client.server";
import {
  abilityLevels,
  auditEvents,
  contactMethods,
  disciplines,
  organizations,
  people,
  programs,
  registrations,
  seasons,
  studentGuardians,
  students,
  supportRecords,
  surveyResponses,
  surveys,
  timeSlots,
} from "@/db/schema";
import { assessSurveyResponse } from "@/domain/surveys/response-assessment";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function loadSurveyAssessmentContext(
  tx: Transaction | typeof db,
  organizationId: string,
): Promise<SurveyAssessmentContext> {
  const studentRows = await surveyMatchCandidates(tx, organizationId);
  const enrollmentRows = await tx
    .select({ registration: registrations })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.studentId))
    .innerJoin(programs, eq(programs.id, registrations.programId))
    .innerJoin(seasons, eq(seasons.id, programs.seasonId))
    .where(
      and(
        eq(people.organizationId, organizationId),
        eq(seasons.organizationId, organizationId),
        isNull(people.archivedAt),
        isNull(seasons.archivedAt),
        isNull(registrations.archivedAt),
        eq(registrations.status, "active"),
      ),
    );
  const programIds = [
    ...new Set(enrollmentRows.map((item) => item.registration.programId)),
  ];
  const [slots, disciplineRows, levels] = programIds.length
    ? await Promise.all([
        tx
          .select()
          .from(timeSlots)
          .where(
            and(
              inArray(timeSlots.programId, programIds),
              eq(timeSlots.active, true),
            ),
          ),
        tx
          .select()
          .from(disciplines)
          .where(
            and(
              inArray(disciplines.programId, programIds),
              eq(disciplines.active, true),
            ),
          ),
        tx
          .select()
          .from(abilityLevels)
          .where(
            and(
              inArray(abilityLevels.programId, programIds),
              eq(abilityLevels.active, true),
            ),
          ),
      ])
    : [[], [], []];
  const responseRows = await tx
    .select({
      id: surveyResponses.id,
      confirmedStudentId: surveyResponses.confirmedStudentId,
      childDateOfBirth: surveyResponses.childDateOfBirth,
      answers: surveyResponses.answers,
    })
    .from(surveyResponses)
    .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
    .where(eq(surveys.organizationId, organizationId));
  return {
    students: studentRows,
    registrations: enrollmentRows.map((item) => item.registration),
    slots,
    disciplines: disciplineRows,
    levels,
    responses: responseRows,
  };
}

// Every write path assesses identity and enrollment evidence before enrichment.
export async function fillConfirmedSurveyBirthdates(
  tx: Transaction,
  organizationId: string,
  actorId: string | null,
  studentId?: string,
) {
  const context = await loadSurveyAssessmentContext(tx, organizationId);
  const responses = await tx
    .select({ response: surveyResponses })
    .from(surveyResponses)
    .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
    .where(
      and(
        eq(surveys.organizationId, organizationId),
        studentId
          ? eq(surveyResponses.confirmedStudentId, studentId)
          : undefined,
      ),
    )
    .for("update", { of: surveyResponses });
  let registrationsFilled = 0,
    medicalNotesAdded = 0,
    reviewNeeded = 0;
  const birthdateConflicts = new Set<string>();
  for (const { response } of responses) {
    if (
      response.confirmedStudentId &&
      new Set(
        responses
          .filter(
            (item) =>
              item.response.confirmedStudentId === response.confirmedStudentId,
          )
          .map((item) => item.response.childDateOfBirth),
      ).size > 1
    )
      birthdateConflicts.add(response.confirmedStudentId);
  }
  const safeBirthdateResponses = new Set<string>();
  for (const { response } of responses) {
    const assessment = assessSurveyResponse(response, context);
    const registration = assessment.registration;
    const abilityConflict = assessment.issues.some((issue) =>
      issue.startsWith("Ability evidence conflicts"),
    );
    await tx
      .update(surveyResponses)
      .set({
        enrichmentIssues: assessment.unresolvedIssues,
        candidateRegistrationIds: assessment.candidateRegistrationIds,
      })
      .where(eq(surveyResponses.id, response.id));
    if (assessment.unresolvedIssues.length) reviewNeeded++;
    if (!response.confirmedStudentId || assessment.unresolvedIssues.length)
      continue;
    if (!birthdateConflicts.has(response.confirmedStudentId))
      safeBirthdateResponses.add(response.id);
    const medical =
      typeof response.answers.medicalConcerns === "string"
        ? response.answers.medicalConcerns.trim()
        : "";
    if (medical) {
      const inserted = await tx
        .insert(supportRecords)
        .values({
          studentId: response.confirmedStudentId,
          category: "special_condition",
          restrictedNote: medical,
          requiresReview: true,
          sourceResponseId: response.id,
          sourceSubmittedAt: response.submittedAt,
        })
        .onConflictDoNothing()
        .returning({ id: supportRecords.id });
      medicalNotesAdded += inserted.length;
    }
    if (
      !registration ||
      !assessment.discipline ||
      !assessment.level ||
      abilityConflict
    )
      continue;
    if (!registration.disciplineId || !registration.abilityLevelId) {
      const filled = await tx
        .update(registrations)
        .set({
          disciplineId: registration.disciplineId ?? assessment.discipline.id,
          abilityLevelId: registration.abilityLevelId ?? assessment.level.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(registrations.id, registration.id),
            sql`${registrations.disciplineId} is not distinct from ${registration.disciplineId}`,
            sql`${registrations.abilityLevelId} is not distinct from ${registration.abilityLevelId}`,
          ),
        )
        .returning({ id: registrations.id });
      registrationsFilled += filled.length;
      if (filled.length) {
        registration.disciplineId ??= assessment.discipline.id;
        registration.abilityLevelId ??= assessment.level.id;
      }
    }
  }
  const birthdates = await fillBirthdates(
    tx,
    organizationId,
    actorId,
    studentId,
    safeBirthdateResponses,
  );
  if (registrationsFilled || medicalNotesAdded)
    await tx.insert(auditEvents).values({
      organizationId,
      actorId,
      entityType: "survey_matching",
      entityId: studentId ?? organizationId,
      action: "survey.enriched",
      metadata: { registrationsFilled, medicalNotesAdded },
    });
  return {
    ...birthdates,
    birthdateConflicts: birthdateConflicts.size,
    registrationsFilled,
    medicalNotesAdded,
    reviewNeeded,
  };
}

// Only confirmed identities and agreeing responses may fill a blank profile.
// Existing profile values remain authoritative, including concurrent edits.
async function fillBirthdates(
  tx: Transaction,
  organizationId: string,
  actorId: string | null,
  studentId?: string,
  safeResponseIds: Set<string> = new Set(),
) {
  if (!safeResponseIds.size)
    return { birthdatesFilled: 0, birthdateConflicts: 0 };
  const dates = await tx
    .select({
      studentId: people.id,
      earliest: sql<string>`min(${surveyResponses.childDateOfBirth})::text`,
      latest: sql<string>`max(${surveyResponses.childDateOfBirth})::text`,
    })
    .from(surveyResponses)
    .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
    .innerJoin(people, eq(people.id, surveyResponses.confirmedStudentId))
    .innerJoin(students, eq(students.personId, people.id))
    .where(
      and(
        eq(surveys.organizationId, organizationId),
        inArray(surveyResponses.id, [...safeResponseIds]),
        eq(people.organizationId, organizationId),
        isNull(people.archivedAt),
        isNull(people.dateOfBirth),
        studentId ? eq(people.id, studentId) : undefined,
      ),
    )
    .groupBy(people.id);
  const filled: Array<string> = [];
  let conflicts = 0;
  for (const date of dates) {
    if (date.earliest !== date.latest) {
      conflicts++;
      continue;
    }
    const updated = await tx
      .update(people)
      .set({ dateOfBirth: date.earliest, updatedAt: new Date() })
      .where(
        and(
          eq(people.id, date.studentId),
          eq(people.organizationId, organizationId),
          isNull(people.dateOfBirth),
          isNull(people.archivedAt),
        ),
      )
      .returning({ id: people.id });
    if (updated.length) filled.push(date.studentId);
  }
  if (filled.length)
    await tx.insert(auditEvents).values({
      organizationId,
      actorId,
      entityType: "survey_matching",
      entityId: organizationId,
      action: "survey.birthdates_filled",
      metadata: { studentIds: filled, count: filled.length },
    });
  return { birthdatesFilled: filled.length, birthdateConflicts: conflicts };
}

export async function surveyMatchCandidates(
  tx: Transaction | typeof db,
  organizationId: string,
) {
  const rows = await tx
    .select({
      studentId: students.personId,
      firstName: people.firstName,
      lastName: people.lastName,
      dateOfBirth: people.dateOfBirth,
    })
    .from(students)
    .innerJoin(people, eq(people.id, students.personId))
    .where(
      and(eq(people.organizationId, organizationId), isNull(people.archivedAt)),
    );
  const emails = await tx
    .select({
      studentId: studentGuardians.studentId,
      email: contactMethods.value,
    })
    .from(studentGuardians)
    .innerJoin(people, eq(people.id, studentGuardians.studentId))
    .innerJoin(
      contactMethods,
      and(
        eq(contactMethods.personId, studentGuardians.guardianId),
        eq(contactMethods.kind, "email"),
      ),
    )
    .where(eq(people.organizationId, organizationId));
  return rows.map((row) => ({
    ...row,
    guardianEmails: emails
      .filter((email) => email.studentId === row.studentId)
      .map((email) => email.email),
  }));
}

// Called inside import apply so imported identities and their matches commit together.
// A human or previous automatic confirmation is never silently reassigned.
export async function reconcileSurveyMatches(tx: Transaction, actor: Actor) {
  await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, actor.organizationId))
    .for("update");
  const context = await loadSurveyAssessmentContext(tx, actor.organizationId);
  const responses = await tx
    .select({ response: surveyResponses })
    .from(surveyResponses)
    .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
    .where(eq(surveys.organizationId, actor.organizationId))
    .for("update", { of: surveyResponses });
  let matched = 0;
  for (const { response } of responses) {
    const assessment = assessSurveyResponse(response, context);
    const reopen =
      response.linkSource === "automatic" &&
      assessment.unresolvedIssues.length > 0;
    const confirm = !response.confirmedStudentId && assessment.canAutoConfirm;
    await tx
      .update(surveyResponses)
      .set({
        suggestedStudentId: assessment.studentId,
        confirmedStudentId: reopen
          ? null
          : (response.confirmedStudentId ??
            (confirm ? assessment.studentId : null)),
        matchStatus:
          reopen || assessment.unresolvedIssues.length
            ? assessment.studentId
              ? "ambiguous"
              : "unmatched"
            : "unique",
        linkSource: confirm ? "automatic" : response.linkSource,
        enrichmentIssues: assessment.unresolvedIssues,
        candidateRegistrationIds: assessment.candidateRegistrationIds,
        updatedAt: new Date(),
      })
      .where(eq(surveyResponses.id, response.id));
    if (confirm) matched++;
    if (reopen)
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        entityType: "survey_response",
        entityId: response.id,
        action: "survey.match_reopened",
        metadata: {
          studentId: response.confirmedStudentId,
          issues: assessment.unresolvedIssues,
        },
      });
  }
  await tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    entityType: "survey_matching",
    entityId: actor.organizationId,
    action: "survey.matches_reconciled",
    metadata: { matched, reviewed: responses.length },
  });
  const birthdates = await fillConfirmedSurveyBirthdates(
    tx,
    actor.organizationId,
    actor.userId,
  );
  return { matched, needsReview: birthdates.reviewNeeded, ...birthdates };
}

export async function refreshSurveyMatches(actor: Actor) {
  requirePermission(actor, "people:manage");
  return db.transaction((tx) => reconcileSurveyMatches(tx, actor));
}

export const confirmSurveyMatchSchema = z.object({
  responseId: z.uuid(),
  studentId: z.uuid(),
  fillMissingBirthDate: z.boolean().default(false),
  acknowledgeConflicts: z.boolean().default(false),
  reviewEvidenceKey: z.string().max(100000).optional(),
  programId: z.uuid().optional(),
});

export async function confirmSurveyMatch(
  actor: Actor,
  input: z.input<typeof confirmSurveyMatchSchema>,
) {
  requirePermission(actor, "people:manage");
  const parsed = confirmSurveyMatchSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId))
      .for("update");
    const [response] = await tx
      .select({ ...getTableColumns(surveyResponses) })
      .from(surveyResponses)
      .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
      .where(
        and(
          eq(surveyResponses.id, parsed.responseId),
          eq(surveys.organizationId, actor.organizationId),
        ),
      )
      .for("update", { of: surveyResponses });
    const [student] = await tx
      .select({ id: people.id })
      .from(students)
      .innerJoin(people, eq(people.id, students.personId))
      .where(
        and(
          eq(students.personId, parsed.studentId),
          eq(people.organizationId, actor.organizationId),
          isNull(people.archivedAt),
        ),
      );
    if (!response || !student)
      throw new ApplicationError(
        "NOT_FOUND",
        "The response or student is no longer available.",
      );
    if (
      response.confirmedStudentId &&
      response.confirmedStudentId !== student.id
    )
      throw new ApplicationError(
        "VALIDATION",
        "This response is already confirmed for another student. Existing confirmed links cannot be silently reassigned.",
      );
    const context = await loadSurveyAssessmentContext(tx, actor.organizationId);
    const assessment = assessSurveyResponse(
      {
        ...response,
        confirmedStudentId: student.id,
        linkSource: "staff",
        reviewAcknowledgement: null,
      },
      context,
    );
    const issues = [
      ...new Set([...assessment.issues, ...response.enrichmentIssues]),
    ];
    if (
      parsed.reviewEvidenceKey &&
      parsed.reviewEvidenceKey !== assessment.evidenceKey
    )
      throw new ApplicationError(
        "VERSION_CONFLICT",
        "The roster or survey evidence changed. Reload the response and review the current values.",
      );
    if (issues.length && !parsed.acknowledgeConflicts)
      throw new ApplicationError(
        "VALIDATION",
        "Review and acknowledge the conflicting values before confirming this match.",
      );
    await tx
      .update(surveyResponses)
      .set({
        confirmedStudentId: student.id,
        suggestedStudentId: student.id,
        linkSource: "staff",
        candidateRegistrationIds: assessment.candidateRegistrationIds,
        reviewAcknowledgement: {
          studentId: student.id,
          issues,
          evidenceKey: assessment.evidenceKey,
          reviewedBy: actor.userId,
          reviewedAt: new Date().toISOString(),
        },
        matchStatus: "unique",
        updatedAt: new Date(),
      })
      .where(eq(surveyResponses.id, response.id));
    await fillConfirmedSurveyBirthdates(
      tx,
      actor.organizationId,
      actor.userId,
      student.id,
    );
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "survey_response",
      entityId: response.id,
      action: "survey.match_confirmed",
      metadata: {
        studentId: student.id,
        fillMissingBirthDate: parsed.fillMissingBirthDate,
        acknowledgedIssues: issues,
      },
    });
  });
}
