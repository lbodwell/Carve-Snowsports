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
  surveyResponses,
  surveys,
} from "@/db/schema";
import { matchSurveyStudent } from "@/domain/surveys/student-matching";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  return { matched, needsReview: responses.length - matched };
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
    await tx
      .update(surveyResponses)
      .set({
        confirmedStudentId: student.id,
        suggestedStudentId: student.id,
        matchStatus: "unique",
        updatedAt: new Date(),
      })
      .where(eq(surveyResponses.id, response.id));
    if (parsed.fillMissingBirthDate) {
      await tx
        .update(people)
        .set({ dateOfBirth: response.dateOfBirth, updatedAt: new Date() })
        .where(and(eq(people.id, student.id), isNull(people.dateOfBirth)));
      if (parsed.programId) {
        const [program] = await tx
          .select({ id: programs.id })
          .from(programs)
          .innerJoin(seasons, eq(seasons.id, programs.seasonId))
          .where(
            and(
              eq(programs.id, parsed.programId),
              eq(seasons.organizationId, actor.organizationId),
              isNull(seasons.archivedAt),
            ),
          );
        if (!program)
          throw new ApplicationError("NOT_FOUND", "Program not found.");
        const [discipline] = await tx
          .select({ id: disciplines.id })
          .from(disciplines)
          .where(
            and(
              eq(disciplines.programId, program.id),
              eq(disciplines.key, String(response.answers.discipline)),
              eq(disciplines.active, true),
            ),
          );
        const [level] = await tx
          .select({ id: abilityLevels.id })
          .from(abilityLevels)
          .where(
            and(
              eq(abilityLevels.programId, program.id),
              eq(abilityLevels.key, String(response.answers.level)),
              eq(abilityLevels.active, true),
            ),
          );
        const enrollments = await tx
          .select()
          .from(registrations)
          .where(
            and(
              eq(registrations.studentId, student.id),
              eq(registrations.programId, program.id),
              eq(registrations.status, "active"),
              isNull(registrations.archivedAt),
            ),
          )
          .for("update");
        for (const enrollment of enrollments) {
          if (
            !discipline ||
            (enrollment.disciplineId &&
              enrollment.disciplineId !== discipline.id)
          )
            continue;
          await tx
            .update(registrations)
            .set({
              disciplineId: sql`coalesce(${registrations.disciplineId}, ${discipline.id}::uuid)`,
              abilityLevelId: level
                ? sql`coalesce(${registrations.abilityLevelId}, ${level.id}::uuid)`
                : enrollment.abilityLevelId,
              updatedAt: new Date(),
            })
            .where(eq(registrations.id, enrollment.id));
        }
      }
    }
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
