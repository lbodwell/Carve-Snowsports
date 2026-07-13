import { Link } from "@tanstack/react-router";
import { Archive, ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  archiveStudent,
  updateStudent,
} from "@/server/functions/student-roster";

type StudentDetail = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  registrationId: string | null;
  registrationStatus: string | null;
  disciplineId: string | null;
  abilityLevelId: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  medicalInfo: string;
  notes: string;
};

type StudentDetailEditorProps = {
  programName: string | null;
  disciplines: Array<{ id: string; label: string }>;
  abilityLevels: Array<{ id: string; label: string }>;
  student: StudentDetail;
  onArchived: () => void;
  onSaved: () => void;
};

export function StudentDetailEditor({
  abilityLevels,
  disciplines,
  onArchived,
  onSaved,
  programName,
  student,
}: StudentDetailEditorProps) {
  const [firstName, setFirstName] = useState(student.firstName);
  const [lastName, setLastName] = useState(student.lastName);
  const [dateOfBirth, setDateOfBirth] = useState(student.dateOfBirth ?? "");
  const [disciplineId, setDisciplineId] = useState(student.disciplineId ?? "");
  const [abilityLevelId, setAbilityLevelId] = useState(
    student.abilityLevelId ?? "",
  );
  const [guardianName, setGuardianName] = useState(student.guardianName);
  const [guardianPhone, setGuardianPhone] = useState(student.guardianPhone);
  const [guardianEmail, setGuardianEmail] = useState(student.guardianEmail);
  const [medicalInfo, setMedicalInfo] = useState(student.medicalInfo);
  const [notes, setNotes] = useState(student.notes);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showArchiveConfirmation, setShowArchiveConfirmation] = useState(false);

  const isRegistered = student.registrationId != null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await updateStudent({
        data: {
          studentId: student.id,
          firstName,
          lastName,
          dateOfBirth,
          disciplineId: disciplineId || null,
          abilityLevelId: abilityLevelId || null,
          guardianName,
          guardianPhone,
          guardianEmail,
          medicalInfo,
          notes,
        },
      });
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The student could not be updated. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive() {
    setError(null);
    setIsArchiving(true);
    try {
      await archiveStudent({ data: { studentId: student.id } });
      onArchived();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The student could not be archived. Please try again.",
      );
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          to="/admin/students"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeft aria-hidden />
          Back to students
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {student.firstName} {student.lastName}
          </h1>
          <Badge variant={isRegistered ? "secondary" : "outline"}>
            {isRegistered
              ? statusLabel(student.registrationStatus)
              : "Not registered"}
          </Badge>
        </div>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          Update this student record. Their active registration applies to{" "}
          {programName ?? "the current program"}.
        </p>
      </header>

      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-student-first-name">
              First name
            </FieldLabel>
            <Input
              id="edit-student-first-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-student-last-name">Last name</FieldLabel>
            <Input
              id="edit-student-last-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-student-date-of-birth">
              Date of birth
            </FieldLabel>
            <Input
              id="edit-student-date-of-birth"
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              required
            />
            <FieldDescription>
              Dates are stored directly so age can be calculated for each
              season.
            </FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="edit-student-discipline">
                Discipline
              </FieldLabel>
              <select
                id="edit-student-discipline"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={disciplineId}
                onChange={(event) => setDisciplineId(event.target.value)}
              >
                <option value="">Not set</option>
                {disciplines.map((discipline) => (
                  <option key={discipline.id} value={discipline.id}>
                    {discipline.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-student-level">
                Ability level
              </FieldLabel>
              <select
                id="edit-student-level"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={abilityLevelId}
                onChange={(event) => setAbilityLevelId(event.target.value)}
              >
                <option value="">Not set</option>
                {abilityLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="edit-guardian-name">Guardian name</FieldLabel>
            <Input
              id="edit-guardian-name"
              value={guardianName}
              onChange={(event) => setGuardianName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-guardian-phone">
              Guardian phone
            </FieldLabel>
            <Input
              id="edit-guardian-phone"
              type="tel"
              value={guardianPhone}
              onChange={(event) => setGuardianPhone(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-guardian-email">
              Guardian email
            </FieldLabel>
            <Input
              id="edit-guardian-email"
              type="email"
              value={guardianEmail}
              onChange={(event) => setGuardianEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-medical-info">
              Medical/support information
            </FieldLabel>
            <textarea
              id="edit-medical-info"
              className="border-input bg-background min-h-24 rounded-md border p-3 text-sm"
              value={medicalInfo}
              onChange={(event) => setMedicalInfo(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-student-notes">
              Placement notes
            </FieldLabel>
            <textarea
              id="edit-student-notes"
              className="border-input bg-background min-h-24 rounded-md border p-3 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          {error ? (
            <Field data-invalid>
              <FieldError>{error}</FieldError>
            </Field>
          ) : null}

          <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
            <Button asChild type="button" variant="outline">
              <Link to="/admin/students">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSaving}>
              <Save data-icon="inline-start" />
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </FieldGroup>
      </form>

      <section className="border-destructive/30 bg-destructive/5 flex flex-col gap-3 rounded-xl border p-4">
        <div>
          <h2 className="font-medium">Archive student</h2>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Archiving removes this student and their active registrations from
            the working roster while retaining the audit history.
          </p>
        </div>
        {showArchiveConfirmation ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm font-medium">
              Archive {student.firstName} {student.lastName}?
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowArchiveConfirmation(false)}
            >
              Keep student
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isArchiving}
              onClick={handleArchive}
            >
              <Archive data-icon="inline-start" />
              {isArchiving ? "Archiving…" : "Archive"}
            </Button>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setShowArchiveConfirmation(true)}
            >
              <Archive data-icon="inline-start" />
              Archive student
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function statusLabel(status: string | null) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
