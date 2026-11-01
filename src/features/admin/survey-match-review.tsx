import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeName } from "@/domain/surveys/student-matching";

type Student = {
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  registrations?: Array<{
    id: string;
    discipline: string;
    level: string;
    schedule: string;
  }>;
  reviewEvidenceKey?: string;
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
    enrichmentIssues?: Array<string>;
  };
  busy: boolean;
  onConfirm: (
    studentId: string,
    fillMissingBirthDate: boolean,
    programId?: string,
    acknowledgeConflicts?: boolean,
    reviewEvidenceKey?: string,
    birthdateDecision?: "keep-roster" | "use-survey",
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const birthdateChoiceName = useId();
  const [acknowledge, setAcknowledge] = useState(false);
  const [birthdateDecision, setBirthdateDecision] = useState<
    "keep-roster" | "use-survey"
  >("keep-roster");
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
        A unique identity can link automatically when the registered session,
        discipline and level agree. Missing birthdates can be filled;
        conflicting evidence requires staff review.
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
            setAcknowledge(false);
            setBirthdateDecision("keep-roster");
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
          <fieldset className="grid gap-2 rounded border border-amber-300 p-3 text-sm">
            <legend className="font-semibold">Birthdate decision</legend>
            <p>
              Birthdates differ. Verify this is the same child and choose which
              date to use.
            </p>
            {(["keep-roster", "use-survey"] as const).map((decision) => (
              <label key={decision} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={birthdateChoiceName}
                  value={decision}
                  checked={birthdateDecision === decision}
                  onChange={() => {
                    setBirthdateDecision(decision);
                    setAcknowledge(false);
                  }}
                />
                {decision === "keep-roster"
                  ? `Keep roster birthdate · ${selected.dateOfBirth}`
                  : `Use survey birthdate · ${response.childDateOfBirth}`}
              </label>
            ))}
          </fieldset>
        )}
      <p className="text-muted-foreground text-sm">
        Linking a response automatically fills a missing student birthdate.
        Conflicting birthdates change only when staff choose the survey date
        during review.
      </p>
      {selected?.registrations?.map((registration) => (
        <p key={registration.id} className="rounded border p-2 text-sm">
          Roster: {registration.schedule} · {registration.discipline} ·{" "}
          {registration.level}
        </p>
      ))}
      <p className="text-muted-foreground text-sm">
        Confirmed links automatically fill missing profile and matching
        registration information, and retain attributed medical notes. Conflicts
        remain for review.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={acknowledge}
          onChange={(event) => setAcknowledge(event.target.checked)}
        />
        I have reviewed the roster and survey values, confirm this is the same
        child, and accept the remaining differences. Apply my birthdate decision
        above; preserve other roster values.
      </label>
      <Button
        className="w-fit"
        disabled={
          busy ||
          !selectedId ||
          (Boolean(
            response.enrichmentIssues?.length ||
            (selected?.dateOfBirth &&
              selected.dateOfBirth !== response.childDateOfBirth),
          ) &&
            !acknowledge) ||
          Boolean(
            response.confirmedStudentId &&
            selectedId !== response.confirmedStudentId,
          )
        }
        onClick={() =>
          onConfirm(
            selectedId,
            false,
            undefined,
            acknowledge,
            selected?.reviewEvidenceKey,
            birthdateDecision,
          )
        }
      >
        Confirm student match
      </Button>
    </div>
  );
}
