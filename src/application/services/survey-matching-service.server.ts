import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import { requirePermission } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { db } from "@/db/client.server";
import {
  abilityLevels,
  auditEvents,
  contactMethods,
  disciplines,
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
import { surveyMatchesRegistrationSession } from "@/domain/surveys/enrichment-context";
import { matchSurveyStudent } from "@/domain/surveys/student-matching";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Retained export name for existing callers; every confirmed-link path now
// reconciles all supported fields, including responses linked in earlier runs.
export async function fillConfirmedSurveyBirthdates(
  tx: Transaction,
  organizationId: string,
  actorId: string | null,
  studentId?: string,
) {
  const birthdates = await fillBirthdates(
    tx,
    organizationId,
    actorId,
    studentId,
  );
  const responses = await tx
    .select({ response: surveyResponses, birthdate: people.dateOfBirth })
    .from(surveyResponses)
    .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
    .innerJoin(people, eq(people.id, surveyResponses.confirmedStudentId))
    .where(
      and(
        eq(surveys.organizationId, organizationId),
        eq(people.organizationId, organizationId),
        isNull(people.archivedAt),
        studentId ? eq(people.id, studentId) : undefined,
      ),
    );
  const enrollments = await tx
    .select({ registration: registrations })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.studentId))
    .innerJoin(programs, eq(programs.id, registrations.programId))
    .innerJoin(seasons, eq(seasons.id, programs.seasonId))
    .where(
      and(
        eq(people.organizationId, organizationId),
        eq(seasons.organizationId, organizationId),
        isNull(seasons.archivedAt),
        isNull(people.archivedAt),
        isNull(registrations.archivedAt),
        eq(registrations.status, "active"),
        studentId ? eq(people.id, studentId) : undefined,
      ),
    )
    .for("update", { of: registrations });
  const issues = new Map(
    responses.map(({ response, birthdate }) => [
      response.id,
      birthdate && birthdate !== response.childDateOfBirth
        ? ["Birthdate conflicts with the student record."]
        : ([] as Array<string>),
    ]),
  );
  const configurations = new Map<
    string,
    {
      slots: Array<typeof timeSlots.$inferSelect>;
      disciplines: Array<typeof disciplines.$inferSelect>;
      levels: Array<typeof abilityLevels.$inferSelect>;
    }
  >();
  for (const programId of new Set(
    enrollments.map((item) => item.registration.programId),
  )) {
    const [slots, disciplineRows, levels] = await Promise.all([
      tx
        .select()
        .from(timeSlots)
        .where(
          and(eq(timeSlots.programId, programId), eq(timeSlots.active, true)),
        ),
      tx
        .select()
        .from(disciplines)
        .where(
          and(
            eq(disciplines.programId, programId),
            eq(disciplines.active, true),
          ),
        ),
      tx
        .select()
        .from(abilityLevels)
        .where(
          and(
            eq(abilityLevels.programId, programId),
            eq(abilityLevels.active, true),
          ),
        ),
    ]);
    configurations.set(programId, {
      slots,
      disciplines: disciplineRows,
      levels,
    });
  }
  const eligibleRegistrations = new Map<string, Array<string>>();
  for (const { response } of responses) {
    if (
      new Set(
        responses
          .filter(
            (item) =>
              item.response.confirmedStudentId === response.confirmedStudentId,
          )
          .map((item) => item.response.childDateOfBirth),
      ).size > 1
    )
      issues.get(response.id)!.push("Linked responses disagree on birthdate.");
    const candidates = enrollments
      .filter(({ registration }) => {
        const config = configurations.get(registration.programId)!;
        const discipline = config.disciplines.find(
          (item) => item.key === response.answers.discipline,
        );
        return (
          registration.studentId === response.confirmedStudentId &&
          discipline &&
          (!registration.disciplineId ||
            registration.disciplineId === discipline.id) &&
          surveyMatchesRegistrationSession(
            String(response.answers.session),
            registration.sourceSnapshot,
            config.slots,
          )
        );
      })
      .map((item) => item.registration.id);
    eligibleRegistrations.set(response.id, candidates);
    if (candidates.length !== 1)
      issues
        .get(response.id)!
        .push(
          candidates.length
            ? "Multiple registrations match this survey session; review program and enrollment context."
            : "No registration uniquely matches the survey session and discipline.",
        );
  }
  const enrichmentReferences: Array<{
    registrationId?: string;
    supportRecordId?: string;
    responseIds: Array<string>;
    categories: Array<string>;
  }> = [];
  let registrationsFilled = 0;
  let medicalNotesAdded = 0;
  for (const { response } of responses) {
    const medical =
      typeof response.answers.medicalConcerns === "string"
        ? response.answers.medicalConcerns.trim()
        : "";
    if (medical) {
      const inserted = await tx
        .insert(supportRecords)
        .values({
          studentId: response.confirmedStudentId!,
          category: "special_condition",
          restrictedNote: medical,
          requiresReview: true,
          sourceResponseId: response.id,
          sourceSubmittedAt: response.submittedAt,
        })
        .onConflictDoNothing()
        .returning({ id: supportRecords.id });
      medicalNotesAdded += inserted.length;
      for (const note of inserted)
        enrichmentReferences.push({
          supportRecordId: note.id,
          responseIds: [response.id],
          categories: ["special_condition"],
        });
    }
  }
  for (const { registration } of enrollments) {
    const linked = responses.filter(
      ({ response }) => response.confirmedStudentId === registration.studentId,
    );
    if (!linked.length) continue;
    const config = configurations.get(registration.programId)!;
    const disciplinesForProgram = config.disciplines,
      levels = config.levels;
    const applicable = linked.filter(({ response }) => {
      const candidates = eligibleRegistrations.get(response.id)!;
      return candidates.length === 1 && candidates[0] === registration.id;
    });
    const evidence = applicable.flatMap(({ response }) => {
      const discipline = disciplinesForProgram.find(
        (item) => item.key === response.answers.discipline,
      );
      const level = levels.find((item) => item.key === response.answers.level);
      if (
        !discipline ||
        !level ||
        (registration.disciplineId &&
          registration.disciplineId !== discipline.id)
      ) {
        issues
          .get(response.id)!
          .push(
            "The survey discipline or ability is not configured in the applicable program.",
          );
        return [];
      }
      return [{ response, discipline, level }];
    });
    if (!evidence.length) continue;
    const disagree =
      new Set(evidence.map((item) => `${item.discipline.id}:${item.level.id}`))
        .size > 1;
    if (
      disagree ||
      (registration.abilityLevelId &&
        evidence.some((item) => item.level.id !== registration.abilityLevelId))
    ) {
      for (const item of evidence)
        issues
          .get(item.response.id)!
          .push("Ability evidence conflicts for an applicable registration.");
      continue;
    }
    const first = evidence[0]!;
    if (!registration.disciplineId || !registration.abilityLevelId) {
      await tx
        .update(registrations)
        .set({
          disciplineId: registration.disciplineId ?? first.discipline.id,
          abilityLevelId: registration.abilityLevelId ?? first.level.id,
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, registration.id));
      registrationsFilled++;
      enrichmentReferences.push({
        registrationId: registration.id,
        responseIds: evidence.map((item) => item.response.id),
        categories: [
          ...(!registration.disciplineId ? ["discipline"] : []),
          ...(!registration.abilityLevelId ? ["ability_level"] : []),
        ],
      });
    }
  }
  for (const { response } of responses) {
    const notes = issues.get(response.id)!;
    if (
      !enrollments.some(
        ({ registration }) =>
          registration.studentId === response.confirmedStudentId,
      )
    )
      notes.push("No active registration is available for ability enrichment.");
    await tx
      .update(surveyResponses)
      .set({ enrichmentIssues: notes })
      .where(eq(surveyResponses.id, response.id));
  }
  if (registrationsFilled || medicalNotesAdded)
    await tx.insert(auditEvents).values({
      organizationId,
      actorId,
      entityType: "survey_matching",
      entityId: studentId ?? organizationId,
      action: "survey.enriched",
      metadata: {
        registrationsFilled,
        medicalNotesAdded,
        references: enrichmentReferences,
      },
    });
  return {
    ...birthdates,
    registrationsFilled,
    medicalNotesAdded,
    reviewNeeded: [...issues.values()].filter((items) => items.length).length,
  };
}

// Only confirmed identities and agreeing responses may fill a blank profile.
// Existing profile values remain authoritative, including concurrent edits.
async function fillBirthdates(
  tx: Transaction,
  organizationId: string,
  actorId: string | null,
  studentId?: string,
) {
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
  const candidates = await surveyMatchCandidates(tx, actor.organizationId);
  const responses = await tx
    .select({
      id: surveyResponses.id,
      firstName: surveyResponses.childFirstName,
      lastName: surveyResponses.childLastName,
      dateOfBirth: surveyResponses.childDateOfBirth,
      answers: surveyResponses.answers,
    })
    .from(surveyResponses)
    .innerJoin(surveys, eq(surveys.id, surveyResponses.surveyId))
    .where(
      and(
        eq(surveys.organizationId, actor.organizationId),
        isNull(surveyResponses.confirmedStudentId),
      ),
    )
    .for("update", { of: surveyResponses });
  let matched = 0;
  for (const response of responses) {
    const match = matchSurveyStudent(
      {
        ...response,
        invitationEmail:
          typeof response.answers.parentEmail === "string"
            ? response.answers.parentEmail
            : null,
      },
      candidates,
    );
    await tx
      .update(surveyResponses)
      .set({
        matchStatus: match.status,
        suggestedStudentId: match.suggestedStudentId,
        confirmedStudentId:
          match.status === "unique" ? match.suggestedStudentId : null,
        updatedAt: new Date(),
      })
      .where(eq(surveyResponses.id, response.id));
    if (match.status === "unique") matched++;
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
  return { matched, needsReview: responses.length - matched, ...birthdates };
}

export async function refreshSurveyMatches(actor: Actor) {
  requirePermission(actor, "people:manage");
  return db.transaction((tx) => reconcileSurveyMatches(tx, actor));
}

export const confirmSurveyMatchSchema = z.object({
  responseId: z.uuid(),
  studentId: z.uuid(),
  fillMissingBirthDate: z.boolean().default(false),
  programId: z.uuid().optional(),
});

export async function confirmSurveyMatch(
  actor: Actor,
  input: z.infer<typeof confirmSurveyMatchSchema>,
) {
  requirePermission(actor, "people:manage");
  const parsed = confirmSurveyMatchSchema.parse(input);
  return db.transaction(async (tx) => {
    const [response] = await tx
      .select({
        id: surveyResponses.id,
        confirmedStudentId: surveyResponses.confirmedStudentId,
        dateOfBirth: surveyResponses.childDateOfBirth,
        answers: surveyResponses.answers,
      })
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
    await tx
      .update(surveyResponses)
      .set({
        confirmedStudentId: student.id,
        suggestedStudentId: student.id,
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
      },
    });
  });
}
