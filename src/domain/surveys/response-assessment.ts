import { matchSurveyStudent, normalizeName } from "./student-matching";
import { surveyMatchesRegistrationSession } from "./enrichment-context";
import type { StudentMatchCandidate } from "./survey-definition";

export type SurveyAssessmentContext = {
  students: Array<StudentMatchCandidate>;
  registrations: Array<{
    id: string;
    studentId: string;
    programId: string;
    sourceSnapshot: Record<string, unknown> | null;
    disciplineId: string | null;
    abilityLevelId: string | null;
  }>;
  slots: Array<{
    id: string;
    programId: string;
    label: string;
    startsAt: string;
    endsAt: string;
    cohort: string;
    allowedWeekdays: Array<number>;
  }>;
  disciplines: Array<{ id: string; programId: string; key: string }>;
  levels: Array<{ id: string; programId: string; key: string }>;
  responses?: Array<{
    id: string;
    confirmedStudentId: string | null;
    childDateOfBirth: string;
    answers: Record<string, unknown>;
  }>;
};

export type ReviewAcknowledgement = {
  studentId: string;
  issues: Array<string>;
  evidenceKey: string;
  reviewedBy: string;
  reviewedAt: string;
  birthdateDecision?: {
    action: "keep-roster" | "use-survey";
    previousDateOfBirth: string | null;
    surveyDateOfBirth: string;
  };
};

export function assessSurveyResponse(
  response: {
    id?: string;
    childFirstName: string;
    childLastName: string;
    childDateOfBirth: string;
    answers: Record<string, unknown>;
    confirmedStudentId?: string | null;
    linkSource?: string;
    reviewAcknowledgement?: ReviewAcknowledgement | null;
  },
  context: SurveyAssessmentContext,
) {
  const match = matchSurveyStudent(
    {
      firstName: response.childFirstName,
      lastName: response.childLastName,
      dateOfBirth: response.childDateOfBirth,
      invitationEmail: String(response.answers.parentEmail ?? ""),
    },
    context.students,
  );
  const names = context.students.filter(
    (student) =>
      normalizeName(student.firstName) ===
        normalizeName(response.childFirstName) &&
      normalizeName(student.lastName) === normalizeName(response.childLastName),
  );
  const studentId =
    response.confirmedStudentId ??
    match.suggestedStudentId ??
    (names.length === 1 ? names[0]!.studentId : null);
  const student = context.students.find((item) => item.studentId === studentId);
  const issues: Array<string> = [];
  if (!student)
    issues.push(
      names.length
        ? "Multiple students match this name; confirm the child’s identity."
        : "No student uniquely matches this response.",
    );
  if (
    student &&
    (normalizeName(student.firstName) !==
      normalizeName(response.childFirstName) ||
      normalizeName(student.lastName) !== normalizeName(response.childLastName))
  )
    issues.push(
      `Names differ: roster ${student.firstName} ${student.lastName}; survey ${response.childFirstName} ${response.childLastName}.`,
    );
  if (student?.dateOfBirth && student.dateOfBirth !== response.childDateOfBirth)
    issues.push(
      `Birthdates differ: roster ${student.dateOfBirth}; survey ${response.childDateOfBirth}.`,
    );
  const candidateStudentIds = studentId
    ? [studentId]
    : names.map((item) => item.studentId);
  const enrollments = context.registrations.filter((item) =>
    candidateStudentIds.includes(item.studentId),
  );
  const sessionMatches = enrollments.filter((registration) =>
    surveyMatchesRegistrationSession(
      String(response.answers.session ?? ""),
      registration.sourceSnapshot,
      context.slots.filter((slot) => slot.programId === registration.programId),
    ),
  );
  // Keep all plausible registrations discoverable when the session itself conflicts.
  const candidateRegistrationIds = (
    sessionMatches.length ? sessionMatches : enrollments
  ).map((item) => item.id);
  const registration =
    student && sessionMatches.length === 1 ? sessionMatches[0] : undefined;
  if (!registration)
    issues.push(
      sessionMatches.length > 1
        ? "Multiple registrations match this survey session; review the enrollment context."
        : `No active registration uniquely matches survey session ${String(response.answers.session ?? "")}.`,
    );
  const discipline =
    registration &&
    context.disciplines.find(
      (item) =>
        item.programId === registration.programId &&
        item.key === response.answers.discipline,
    );
  const level =
    registration &&
    context.levels.find(
      (item) =>
        item.programId === registration.programId &&
        item.key === response.answers.level,
    );
  if (registration) {
    const rosterDiscipline = context.disciplines.find(
      (item) => item.id === registration.disciplineId,
    );
    const rosterLevel = context.levels.find(
      (item) => item.id === registration.abilityLevelId,
    );
    if (
      !discipline ||
      (registration.disciplineId && registration.disciplineId !== discipline.id)
    )
      issues.push(
        `Discipline conflicts: roster ${rosterDiscipline?.key ?? registration.disciplineId ?? "missing"}; survey ${String(response.answers.discipline)}.`,
      );
    if (
      !level ||
      (registration.abilityLevelId && registration.abilityLevelId !== level.id)
    )
      issues.push(
        `Level conflicts: roster ${rosterLevel?.key ?? registration.abilityLevelId ?? "missing"}; survey ${String(response.answers.level)}.`,
      );
  }
  const peers = (context.responses ?? []).filter(
    (item) => item.id !== response.id && item.confirmedStudentId === studentId,
  );
  if (peers.some((item) => item.childDateOfBirth !== response.childDateOfBirth))
    issues.push(
      "Linked responses disagree on birthdate: " +
        [
          ...new Set([
            response.childDateOfBirth,
            ...peers.map((item) => item.childDateOfBirth),
          ]),
        ]
          .sort()
          .join(", ") +
        ".",
    );
  const sessionPeers = registration
    ? peers.filter((item) =>
        surveyMatchesRegistrationSession(
          String(item.answers.session ?? ""),
          registration.sourceSnapshot,
          context.slots.filter(
            (slot) => slot.programId === registration.programId,
          ),
        ),
      )
    : [];
  if (
    sessionPeers.some(
      (item) =>
        item.answers.discipline !== response.answers.discipline ||
        item.answers.level !== response.answers.level,
    )
  )
    issues.push(
      "Ability evidence conflicts for an applicable registration: " +
        [
          ...new Set(
            [response, ...sessionPeers].map(
              (item) =>
                String(item.answers.discipline) +
                ":" +
                String(item.answers.level),
            ),
          ),
        ]
          .sort()
          .join(", ") +
        ".",
    );
  const identityAgrees =
    match.status === "unique" && match.suggestedStudentId === studentId;
  if (
    response.confirmedStudentId &&
    response.linkSource === "automatic" &&
    !identityAgrees
  )
    issues.push(
      "The existing automatic identity link cannot be uniquely revalidated.",
    );
  if (
    response.confirmedStudentId &&
    response.linkSource === "unknown" &&
    (!identityAgrees || issues.length)
  )
    issues.push(
      "The origin of this existing link is unknown and its current evidence needs staff review.",
    );
  const acknowledgement = response.reviewAcknowledgement;
  const evidenceKey = JSON.stringify({
    studentId,
    issues,
    survey: [
      response.childFirstName,
      response.childLastName,
      response.childDateOfBirth,
      response.answers.session,
      response.answers.discipline,
      response.answers.level,
    ],
    registrations: enrollments
      .map((item) => [
        item.id,
        item.programId,
        item.sourceSnapshot?.weekday,
        item.sourceSnapshot?.session,
        item.sourceSnapshot?.groupingSchedule,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    slots: context.slots
      .filter((slot) =>
        enrollments.some((item) => item.programId === slot.programId),
      )
      .map((slot) => [
        slot.id,
        slot.cohort,
        slot.startsAt,
        slot.endsAt,
        slot.allowedWeekdays,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  const unresolvedIssues = issues.filter(
    (issue) =>
      acknowledgement?.studentId !== studentId ||
      acknowledgement.evidenceKey !== evidenceKey ||
      !acknowledgement.issues.includes(issue),
  );
  return {
    studentId,
    registration,
    discipline,
    level,
    candidateRegistrationIds,
    issues,
    unresolvedIssues,
    evidenceKey,
    canAutoConfirm: Boolean(
      student && registration && identityAgrees && !issues.length,
    ),
  };
}

export function registrationSurveyStatus(
  registrationId: string,
  responses: ReadonlyArray<{
    confirmedStudentId: string | null;
    candidateRegistrationIds: Array<string>;
    enrichmentIssues: Array<string>;
  }>,
): "No response" | "Needs review" | "Completed" {
  const relevant = responses.filter((response) =>
    response.candidateRegistrationIds.includes(registrationId),
  );
  if (
    relevant.some(
      (response) =>
        !response.confirmedStudentId || response.enrichmentIssues.length,
    )
  )
    return "Needs review";
  return relevant.length ? "Completed" : "No response";
}
