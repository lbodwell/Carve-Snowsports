import { useId, useState } from "react";
import type { SurveyFieldDecisions } from "@/domain/surveys/review-decisions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeName } from "@/domain/surveys/student-matching";
import { surveySessions } from "@/domain/surveys/pre-lesson-intake";

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
  matchingRegistrationId?: string;
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
    answers?: { discipline: string; level: string; session: string };
  };
  busy: boolean;
  onConfirm: (
    studentId: string,
    fillMissingBirthDate: boolean,
    programId?: string,
    acknowledgeConflicts?: boolean,
    reviewEvidenceKey?: string,
    birthdateDecision?: "keep-roster" | "use-survey",
    fieldDecisions?: SurveyFieldDecisions,
    registrationId?: string,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [fieldDecisions, setFieldDecisions] = useState<SurveyFieldDecisions>(
    {},
  );
  const [registrationId, setRegistrationId] = useState<string | undefined>();
  const birthdateChoiceName = useId();
  const [acknowledge, setAcknowledge] = useState(false);
  const [birthdateDecision, setBirthdateDecision] = useState<
    "keep-roster" | "use-survey"
  >("keep-roster");
  const [selectedId, setSelectedId] = useState(
    response.confirmedStudentId ?? response.suggestedStudentId ?? "",
  );
  const selected = students.find((student) => student.studentId === selectedId);
  const targetRegistrationId =
    registrationId ??
    selected?.matchingRegistrationId ??
    (selected?.registrations?.length === 1
      ? selected.registrations[0]!.id
      : undefined);
  const registration = selected?.registrations?.find(
    (item) => item.id === targetRegistrationId,
  );
  const fieldChoices: Array<{
    field: keyof SurveyFieldDecisions;
    label: string;
    roster: string;
    survey: string;
  }> = [];
  if (selected) {
    if (
      normalizeName(selected.firstName) !==
      normalizeName(response.childFirstName)
    )
      fieldChoices.push({
        field: "firstName",
        label: "First name",
        roster: selected.firstName,
        survey: response.childFirstName,
      });
    if (
      normalizeName(selected.lastName) !== normalizeName(response.childLastName)
    )
      fieldChoices.push({
        field: "lastName",
        label: "Last name",
        roster: selected.lastName,
        survey: response.childLastName,
      });
    if (registration && response.answers) {
      if (registration.discipline !== response.answers.discipline)
        fieldChoices.push({
          field: "discipline",
          label: "Discipline",
          roster: registration.discipline,
          survey: response.answers.discipline,
        });
      if (registration.level !== response.answers.level)
        fieldChoices.push({
          field: "level",
          label: "Level",
          roster: registration.level,
          survey: response.answers.level,
        });
      if (targetRegistrationId !== selected.matchingRegistrationId)
        fieldChoices.push({
          field: "session",
          label: "Session",
          roster: registration.schedule,
          survey:
            surveySessions.find(
              (item) => item.key === response.answers!.session,
            )?.label ?? response.answers.session,
        });
    }
  }
  const requiresReview = Boolean(
    response.enrichmentIssues?.length ||
    fieldChoices.length ||
    (selected?.dateOfBirth &&
      selected.dateOfBirth !== response.childDateOfBirth),
  );
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
            setFieldDecisions({});
            setRegistrationId(undefined);
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
      {Boolean(selected?.registrations?.length) && (
        <label className="grid gap-1 text-sm font-medium">
          Registration to review
          <select
            className="rounded-md border bg-white p-2"
            disabled={busy}
            value={targetRegistrationId ?? ""}
            onChange={(event) => {
              setRegistrationId(event.target.value || undefined);
              setFieldDecisions({});
              setAcknowledge(false);
            }}
          >
            <option value="">Choose a registration</option>
            {selected!.registrations!.map((item) => (
              <option key={item.id} value={item.id}>
                {item.schedule} · {item.discipline} · {item.level}
              </option>
            ))}
          </select>
        </label>
      )}
      {fieldChoices.map(({ field, label, roster, survey }) => (
        <fieldset
          key={field}
          className="grid gap-2 rounded border border-amber-300 p-3 text-sm"
          disabled={busy}
        >
          <legend className="font-semibold">{label} decision</legend>
          {(["keep-roster", "use-survey"] as const).map((decision) => (
            <label key={decision} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${birthdateChoiceName}-${field}`}
                checked={(fieldDecisions[field] ?? "keep-roster") === decision}
                onChange={() => {
                  setFieldDecisions((previous) => ({
                    ...previous,
                    [field]: decision,
                  }));
                  setAcknowledge(false);
                }}
              />
              {decision === "keep-roster"
                ? `Keep roster ${label.toLowerCase()} · ${roster}`
                : `Use survey ${label.toLowerCase()} · ${survey}`}
            </label>
          ))}
        </fieldset>
      ))}
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
      {selected?.registrations?.map((enrollment) => (
        <p key={enrollment.id} className="rounded border p-2 text-sm">
          Roster: {enrollment.schedule} · {enrollment.discipline} ·{" "}
          {enrollment.level}
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
        child, and accept the remaining differences. Apply my field decisions
        above; preserve the roster values I chose to keep.
      </label>
      <Button
        className="w-fit"
        disabled={
          busy ||
          !selectedId ||
          (requiresReview && !acknowledge) ||
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
            fieldDecisions,
            targetRegistrationId,
          )
        }
      >
        Confirm student match
      </Button>
    </div>
  );
}
