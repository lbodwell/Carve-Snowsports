import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import type { StudentMatchCandidate } from "@/domain/surveys/survey-definition";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import {
  auditEvents,
  contactMethods,
  people,
  programs,
  registrations,
  seasons,
  studentGuardians,
  students,
  surveyInvitations,
  surveyResponses,
  surveys,
} from "@/db/schema";
import {
  preLessonIntakeAnswersSchema,
  preLessonIntakeDefinition,
} from "@/domain/surveys/pre-lesson-intake";
import { matchSurveyStudent } from "@/domain/surveys/student-matching";
import { env } from "@/server/env.server";

export const publicSurveyRequestSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  token: z.string().trim().min(32).max(128).optional(),
});

export const submitPublicSurveySchema = publicSurveyRequestSchema.extend({
  website: z.string().max(500).default(""),
  answers: z.unknown(),
});

export const surveyIdSchema = z.object({ surveyId: z.uuid() });

export const addSurveyInvitationSchema = surveyIdSchema.extend({
  email: z.email(),
});

export const updateSurveyAccessSchema = surveyIdSchema.extend({
  status: z.enum(["draft", "open", "closed"]),
  allowAnonymous: z.boolean(),
});

type PublicSurveyRow = {
  id: string;
  organizationId: string;
  slug: string;
  title: string;
  definitionKey: string;
  definitionVersion: number;
  allowAnonymous: boolean;
  invitationId: string | null;
  invitationEmail: string | null;
};

async function resolvePublicSurvey(
  input: z.infer<typeof publicSurveyRequestSchema>,
): Promise<PublicSurveyRow> {
  const [survey] = await db
    .select({
      id: surveys.id,
      organizationId: surveys.organizationId,
      slug: surveys.slug,
      title: surveys.title,
      status: surveys.status,
      definitionKey: surveys.definitionKey,
      definitionVersion: surveys.definitionVersion,
      allowAnonymous: surveys.allowAnonymous,
    })
    .from(surveys)
    .where(eq(surveys.slug, input.slug));

  if (!survey || survey.status !== "open") {
    throw new ApplicationError(
      "NOT_FOUND",
      "This survey is not currently available.",
    );
  }
  if (
    survey.definitionKey !== preLessonIntakeDefinition.key ||
    survey.definitionVersion !== preLessonIntakeDefinition.version
  ) {
    throw new ApplicationError(
      "INVALID_STATE",
      "This survey version is not supported.",
    );
  }

  if (!input.token) {
    if (!survey.allowAnonymous) {
      throw new ApplicationError(
        "FORBIDDEN",
        "This survey requires a personal invitation link.",
      );
    }
    return {
      ...survey,
      invitationId: null,
      invitationEmail: null,
    };
  }

  const [invitation] = await db
    .select({
      id: surveyInvitations.id,
      email: surveyInvitations.email,
    })
    .from(surveyInvitations)
    .where(
      and(
        eq(surveyInvitations.surveyId, survey.id),
        eq(surveyInvitations.token, input.token),
      ),
    );
  if (!invitation) {
    throw new ApplicationError(
      "NOT_FOUND",
      "This survey invitation could not be found.",
    );
  }

  return {
    ...survey,
    invitationId: invitation.id,
    invitationEmail: invitation.email,
  };
}

async function getStudentMatchCandidates(
  organizationId: string,
): Promise<Array<StudentMatchCandidate>> {
  const studentRows = await db
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
  const studentIds = studentRows.map((student) => student.studentId);
  const guardianEmails =
    studentIds.length === 0
      ? []
      : await db
          .select({
            studentId: studentGuardians.studentId,
            email: contactMethods.value,
          })
          .from(studentGuardians)
          .innerJoin(
            contactMethods,
            and(
              eq(contactMethods.personId, studentGuardians.guardianId),
              eq(contactMethods.kind, "email"),
            ),
          )
          .where(inArray(studentGuardians.studentId, studentIds));

  const emailsByStudent = new Map<string, Array<string>>();
  for (const row of guardianEmails) {
    const emails = emailsByStudent.get(row.studentId) ?? [];
    emails.push(row.email);
    emailsByStudent.set(row.studentId, emails);
  }

  return studentRows.map((student) => ({
    ...student,
    guardianEmails: emailsByStudent.get(student.studentId) ?? [],
  }));
}

export async function getPublicSurvey(
  input: z.infer<typeof publicSurveyRequestSchema>,
) {
  const parsed = publicSurveyRequestSchema.parse(input);
  const survey = await resolvePublicSurvey(parsed);
  if (survey.invitationId) {
    await db
      .update(surveyInvitations)
      .set({ lastOpenedAt: new Date(), updatedAt: new Date() })
      .where(eq(surveyInvitations.id, survey.invitationId));
  }

  return {
    slug: survey.slug,
    title: survey.title,
    invited: survey.invitationId !== null,
    invitationEmail: survey.invitationEmail,
  };
}

export async function submitPublicSurvey(
  input: z.infer<typeof submitPublicSurveySchema>,
) {
  const parsed = submitPublicSurveySchema.parse(input);
  const survey = await resolvePublicSurvey(parsed);

  if (!survey.invitationId && parsed.website.trim()) {
    return { accepted: true };
  }

  const answers = preLessonIntakeAnswersSchema.parse(parsed.answers);
  const candidates = await getStudentMatchCandidates(survey.organizationId);
  const match = matchSurveyStudent(
    {
      firstName: answers.childFirstName,
      lastName: answers.childLastName,
      dateOfBirth: answers.childDateOfBirth,
      invitationEmail: survey.invitationEmail ?? answers.parentEmail,
    },
    candidates,
  );

  await db.transaction(async (tx) => {
    const [response] = await tx
      .insert(surveyResponses)
      .values({
        surveyId: survey.id,
        invitationId: survey.invitationId,
        answers,
        childFirstName: answers.childFirstName,
        childLastName: answers.childLastName,
        childDateOfBirth: answers.childDateOfBirth,
        matchStatus: match.status,
        suggestedStudentId: match.suggestedStudentId,
      })
      .returning({ id: surveyResponses.id });
    if (!response) {
      throw new ApplicationError(
        "INVALID_STATE",
        "Pleasant Mountain could not save this response.",
      );
    }
    await tx.insert(auditEvents).values({
      organizationId: survey.organizationId,
      actorId: null,
      entityType: "survey_response",
      entityId: response.id,
      action: "submitted",
      metadata: {
        invited: survey.invitationId !== null,
        matchStatus: match.status,
        surveyId: survey.id,
      },
    });
  });

  return { accepted: true };
}

async function getOrganizationSurvey(actor: Actor, surveyId: string) {
  const [survey] = await db
    .select()
    .from(surveys)
    .where(
      and(
        eq(surveys.id, surveyId),
        eq(surveys.organizationId, actor.organizationId),
      ),
    );
  if (!survey) {
    throw new ApplicationError("NOT_FOUND", "This survey could not be found.");
  }
  return survey;
}

export async function getSurveyWorkspace(actor: Actor) {
  requirePermission(actor, "people:manage");
  const [survey] = await db
    .select()
    .from(surveys)
    .where(eq(surveys.organizationId, actor.organizationId))
    .orderBy(asc(surveys.createdAt));
  if (!survey) {
    return { survey: null, invitations: [], responses: [] };
  }

  const [invitations, responses] = await Promise.all([
    db
      .select({
        id: surveyInvitations.id,
        email: surveyInvitations.email,
        token: surveyInvitations.token,
        lastOpenedAt: surveyInvitations.lastOpenedAt,
        createdAt: surveyInvitations.createdAt,
      })
      .from(surveyInvitations)
      .where(eq(surveyInvitations.surveyId, survey.id))
      .orderBy(asc(surveyInvitations.email)),
    db
      .select({
        id: surveyResponses.id,
        invitationId: surveyResponses.invitationId,
        answers: surveyResponses.answers,
        childFirstName: surveyResponses.childFirstName,
        childLastName: surveyResponses.childLastName,
        childDateOfBirth: surveyResponses.childDateOfBirth,
        matchStatus: surveyResponses.matchStatus,
        suggestedStudentId: surveyResponses.suggestedStudentId,
        suggestedFirstName: people.firstName,
        suggestedLastName: people.lastName,
        submittedAt: surveyResponses.submittedAt,
      })
      .from(surveyResponses)
      .leftJoin(people, eq(people.id, surveyResponses.suggestedStudentId))
      .where(eq(surveyResponses.surveyId, survey.id))
      .orderBy(desc(surveyResponses.submittedAt)),
  ]);

  const responseCountByInvitation = new Map<string, number>();
  for (const response of responses) {
    if (!response.invitationId) continue;
    responseCountByInvitation.set(
      response.invitationId,
      (responseCountByInvitation.get(response.invitationId) ?? 0) + 1,
    );
  }

  return {
    survey: {
      id: survey.id,
      slug: survey.slug,
      title: survey.title,
      status: survey.status,
      allowAnonymous: survey.allowAnonymous,
      anonymousUrl: `${env.APP_ORIGIN}/surveys/${survey.slug}`,
    },
    invitations: invitations.map((invitation) => ({
      ...invitation,
      responseCount: responseCountByInvitation.get(invitation.id) ?? 0,
      url: `${env.APP_ORIGIN}/surveys/${survey.slug}/${invitation.token}`,
    })),
    responses: responses.map((response) => ({
      ...response,
      answers: preLessonIntakeAnswersSchema.parse(response.answers),
    })),
  };
}

function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

async function insertInvitation(
  surveyId: string,
  email: string,
): Promise<boolean> {
  const inserted = await db
    .insert(surveyInvitations)
    .values({
      surveyId,
      email: email.trim().toLowerCase(),
      token: createInvitationToken(),
    })
    .onConflictDoNothing()
    .returning({ id: surveyInvitations.id });
  return inserted.length > 0;
}

export async function addSurveyInvitation(
  actor: Actor,
  input: z.infer<typeof addSurveyInvitationSchema>,
) {
  requirePermission(actor, "people:manage");
  const parsed = addSurveyInvitationSchema.parse(input);
  const survey = await getOrganizationSurvey(actor, parsed.surveyId);
  const created = await insertInvitation(survey.id, parsed.email);
  if (!created) {
    throw new ApplicationError(
      "VALIDATION",
      "This email already has an invitation.",
      { email: ["This email already has an invitation."] },
    );
  }
  await db.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    entityType: "survey",
    entityId: survey.id,
    action: "invitation_added",
    metadata: {},
  });
}

export async function generateSurveyInvitations(
  actor: Actor,
  input: z.infer<typeof surveyIdSchema>,
) {
  requirePermission(actor, "people:manage");
  const parsed = surveyIdSchema.parse(input);
  const survey = await getOrganizationSurvey(actor, parsed.surveyId);
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    )
    .orderBy(asc(seasons.startsOn));
  const [program] = season
    ? await db
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.seasonId, season.id))
        .orderBy(asc(programs.name))
    : [];
  if (!program) {
    throw new ApplicationError(
      "INVALID_STATE",
      "Configure a current program before generating invitations.",
    );
  }

  const emailRows = await db
    .selectDistinct({ email: contactMethods.value })
    .from(registrations)
    .innerJoin(
      studentGuardians,
      eq(studentGuardians.studentId, registrations.studentId),
    )
    .innerJoin(
      contactMethods,
      and(
        eq(contactMethods.personId, studentGuardians.guardianId),
        eq(contactMethods.kind, "email"),
      ),
    )
    .where(
      and(
        eq(registrations.programId, program.id),
        eq(registrations.status, "active"),
        isNull(registrations.archivedAt),
      ),
    );

  let createdCount = 0;
  for (const row of emailRows) {
    if (await insertInvitation(survey.id, row.email)) createdCount += 1;
  }
  await db.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    entityType: "survey",
    entityId: survey.id,
    action: "invitations_generated",
    metadata: { createdCount },
  });
  return { createdCount };
}

export async function updateSurveyAccess(
  actor: Actor,
  input: z.infer<typeof updateSurveyAccessSchema>,
) {
  requirePermission(actor, "people:manage");
  const parsed = updateSurveyAccessSchema.parse(input);
  const survey = await getOrganizationSurvey(actor, parsed.surveyId);
  await db.transaction(async (tx) => {
    await tx
      .update(surveys)
      .set({
        status: parsed.status,
        allowAnonymous: parsed.allowAnonymous,
        updatedAt: new Date(),
      })
      .where(eq(surveys.id, survey.id));
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "survey",
      entityId: survey.id,
      action: "access_updated",
      metadata: {
        allowAnonymous: parsed.allowAnonymous,
        status: parsed.status,
      },
    });
  });
}
