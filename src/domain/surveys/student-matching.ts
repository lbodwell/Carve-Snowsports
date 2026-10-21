import type {
  StudentMatchCandidate,
  StudentMatchResult,
} from "@/domain/surveys/survey-definition";

export function normalizeName(value: string) {
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
  if (!normalizeName(input.firstName) || !normalizeName(input.lastName)) {
    return { status: "unmatched", suggestedStudentId: null };
  }

  const exactMatches = candidates.filter(
    (candidate) =>
      normalizeName(candidate.firstName) === normalizeName(input.firstName) &&
      normalizeName(candidate.lastName) === normalizeName(input.lastName),
  );

  if (exactMatches.length === 0) {
    return { status: "unmatched", suggestedStudentId: null };
  }

  // Missing roster birthdates are expected for Aspenware imports. A conflicting
  // known birthdate still requires review, and duplicate names are never picked
  // merely because only one record has a birthdate.
  if (exactMatches.length === 1) {
    const candidate = exactMatches[0]!;
    if (
      candidate.dateOfBirth &&
      input.dateOfBirth &&
      candidate.dateOfBirth !== input.dateOfBirth
    )
      return { status: "ambiguous", suggestedStudentId: null };
    return { status: "unique", suggestedStudentId: candidate.studentId };
  }

  if (input.invitationEmail) {
    const email = normalizeEmail(input.invitationEmail);
    const invitationMatches = exactMatches.filter((candidate) =>
      candidate.guardianEmails.some(
        (guardianEmail) => normalizeEmail(guardianEmail) === email,
      ),
    );

    if (
      invitationMatches.length === 1 &&
      (!invitationMatches[0]!.dateOfBirth ||
        !input.dateOfBirth ||
        invitationMatches[0]!.dateOfBirth === input.dateOfBirth)
    ) {
      return {
        status: "unique",
        suggestedStudentId: invitationMatches[0]!.studentId,
      };
    }

    if (invitationMatches.length > 1) {
      return { status: "ambiguous", suggestedStudentId: null };
    }
  }

  return { status: "ambiguous", suggestedStudentId: null };
}
