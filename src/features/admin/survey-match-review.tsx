import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeName } from "@/domain/surveys/student-matching";

type Student = {
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
};

export function SurveyMatchReview({
  students,
  response,
  busy,
  onConfirm,
}: {
  students: Array<Student>;
  programs: Array<{ id: string; name: string; seasonName: string }>;
  response: {
    childFirstName: string;
    childLastName: string;
    childDateOfBirth: string;
    confirmedStudentId: string | null;
    suggestedStudentId: string | null;
  };
  busy: boolean;
  onConfirm: (
    studentId: string,
    fillMissingBirthDate: boolean,
    programId?: string,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    response.confirmedStudentId ?? response.suggestedStudentId ?? "",
  );
  const selected = students.find((student) => student.studentId === selectedId);
  const sorted = [...students].sort((left, right) => {
    const score = (student: Student) =>
      Number(
        normalizeName(student.lastName) ===
          normalizeName(response.childLastName),
      ) *
        2 +
      Number(
        normalizeName(student.firstName) ===
          normalizeName(response.childFirstName),
      );
    return (
      score(right) - score(left) || left.lastName.localeCompare(right.lastName)
    );
  });
  const choices = sorted.filter((student) =>
    normalizeName(`${student.firstName} ${student.lastName}`).includes(
      normalizeName(query),
    ),
  );
  return (
    <div className="bg-pm-mist/40 mt-4 grid gap-3 rounded-xl border p-4">
      <h3 className="font-semibold">
        {response.confirmedStudentId
          ? "Linked student"
          : "Match this response to a student"}
      </h3>
      <p className="text-muted-foreground text-sm">
        A unique first and last name can link automatically when a birthdate is
        missing. Duplicate names or conflicting birthdates need review.
      </p>
      <Input
        aria-label={`Search students for ${response.childFirstName} ${response.childLastName}`}
        placeholder="Search roster by student name…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <label className="grid gap-1 text-sm font-medium">
        Student
        <select
          className="rounded-md border bg-white p-2"
          aria-label={`Student for ${response.childFirstName} ${response.childLastName}`}
          value={selectedId}
          disabled={busy}
          onChange={(event) => {
            setSelectedId(event.target.value);
          }}
        >
          <option value="">Choose a student</option>
          {selected &&
            !choices.some((student) => student.studentId === selectedId) && (
              <option value={selectedId}>
                {selected.firstName} {selected.lastName} ·{" "}
                {selected.dateOfBirth ?? "Birthdate missing"}
              </option>
            )}
          {choices.map((student) => (
            <option key={student.studentId} value={student.studentId}>
              {student.firstName} {student.lastName} ·{" "}
              {student.dateOfBirth ?? "Birthdate missing"}
            </option>
          ))}
        </select>
      </label>
      {selected?.dateOfBirth &&
        selected.dateOfBirth !== response.childDateOfBirth && (
          <p className="text-sm font-medium text-amber-800">
            Birthdates differ: roster {selected.dateOfBirth}, survey{" "}
            {response.childDateOfBirth}. Verify this is the same child before
            linking. The roster birthdate will be preserved.
          </p>
        )}
      <p className="text-muted-foreground text-sm">
        Linking a response automatically fills a missing student birthdate.
        Existing birthdates are preserved; conflicting linked answers need
        review.
      </p>
      <p className="text-muted-foreground text-sm">
        Confirmed links automatically fill missing profile and matching
        registration information, and retain attributed medical notes. Conflicts
        remain for review.
      </p>
      <Button
        className="w-fit"
        disabled={
          busy ||
          !selectedId ||
          Boolean(
            response.confirmedStudentId &&
            selectedId !== response.confirmedStudentId,
          )
        }
        onClick={() => onConfirm(selectedId, false)}
      >
        Confirm student match
      </Button>
    </div>
  );
}
