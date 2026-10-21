import { normalizeName } from "@/domain/surveys/student-matching";

/** Candidates for human review only; this function never establishes identity. */
export function possibleImportedStudents<
  T extends { firstName: string; lastName: string },
>(name: string, candidates: ReadonlyArray<T>): Array<T> {
  const parts = name.split(",");
  const first = normalizeName(parts.slice(1).join(" "));
  const last = normalizeName(parts[0] ?? "");
  if (!first || !last) return [];
  return candidates.filter((candidate) => {
    const candidateFirst = normalizeName(candidate.firstName);
    const candidateLast = normalizeName(candidate.lastName);
    return (
      (candidateLast === last && candidateFirst[0] === first[0]) ||
      (candidateFirst === first && candidateLast[0] === last[0])
    );
  });
}
