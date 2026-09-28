import type {
  StudentMatchCandidate,
  StudentMatchResult,
} from "@/domain/surveys/survey-definition";

function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function matchSurveyStudent(
  input: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    invitationEmail?: string | null;
  },
  candidates: Array<StudentMatchCandidate>,
): StudentMatchResult {
  if (!input.dateOfBirth) {
    return { status: "unmatched", suggestedStudentId: null };
  }

  const exactMatches = candidates.filter(
    (candidate) =>
      candidate.dateOfBirth === input.dateOfBirth &&
      normalizeName(candidate.firstName) === normalizeName(input.firstName) &&
      normalizeName(candidate.lastName) === normalizeName(input.lastName),
  );

  if (exactMatches.length === 0) {
    return { status: "unmatched", suggestedStudentId: null };
  }

  if (input.invitationEmail) {
    const email = normalizeEmail(input.invitationEmail);
    const invitationMatches = exactMatches.filter((candidate) =>
      candidate.guardianEmails.some(
        (guardianEmail) => normalizeEmail(guardianEmail) === email,
      ),
    );

    if (invitationMatches.length === 1) {
      return {
        status: "unique",
        suggestedStudentId: invitationMatches[0]!.studentId,
      };
    }

    if (invitationMatches.length > 1) {
      return { status: "ambiguous", suggestedStudentId: null };
    }
  }

  if (exactMatches.length === 1) {
    return {
      status: "unique",
      suggestedStudentId: exactMatches[0]!.studentId,
    };
  }

  return { status: "ambiguous", suggestedStudentId: null };
}
