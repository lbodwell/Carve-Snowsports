import { Link } from "@tanstack/react-router";
import { Archive, ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { RegistrationScheduleSummary } from "@/domain/imports/registration-schedule-summary";
import { RefreshButton } from "@/components/refresh-button";
import { RegistrationScheduleDetails } from "@/features/admin/registration-schedule-details";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveStudent,
  reviewSurveySupport,
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
  surveyMedicalNotes?: Array<{
    note: string | null;
    sourceResponseId: string | null;
    sourceSubmittedAt: Date | null;
    requiresReview: boolean;
  }>;
  notes: string;
  signups?: Array<{
    id: string;
    status: string;
    programName: string;
    seasonName: string;
    disciplineLabel: string | null;
    abilityLevelLabel: string | null;
    schedule: RegistrationScheduleSummary;
  }>;
};

type StudentDetailEditorProps = {
  programName: string | null;
  disciplines: Array<{ id: string; label: string }>;
  abilityLevels: Array<{ id: string; label: string }>;
  student: StudentDetail;
  onArchived: () => void;
  onSaved: () => void | Promise<void>;
  onCancel?: () => void;
  embedded?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function StudentDetailEditor({
  abilityLevels,
  disciplines,
  onArchived,
  onSaved,
  programName,
  student,
  onCancel,
  embedded = false,
  onBusyChange,
}: StudentDetailEditorProps) {
  const [reviewed, setReviewed] = useState<Array<string>>([]);
  const [reviewing, setReviewing] = useState(false);
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

  const isRegistered = student.registrationId != null;
  const isDirty =
    JSON.stringify([
      firstName,
      lastName,
      dateOfBirth,
      disciplineId,
      abilityLevelId,
      guardianName,
      guardianPhone,
      guardianEmail,
      medicalInfo,
      notes,
    ]) !==
    JSON.stringify([
      student.firstName,
      student.lastName,
      student.dateOfBirth ?? "",
      student.disciplineId ?? "",
      student.abilityLevelId ?? "",
      student.guardianName,
      student.guardianPhone,
      student.guardianEmail,
      student.medicalInfo,
      student.notes,
    ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || isSaving) return;
    setError(null);
    setIsSaving(true);
    onBusyChange?.(true);
    try {
      await updateStudent({
        data: {
          studentId: student.id,
          ...(student.registrationId
            ? { registrationId: student.registrationId }
            : {}),
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
      await onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The student could not be updated. Please try again.",
      );
    } finally {
      setIsSaving(false);
      onBusyChange?.(false);
    }
  }

  async function handleArchive() {
    setError(null);
    setIsArchiving(true);
    onBusyChange?.(true);
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
      onBusyChange?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <RefreshButton />
      {!embedded && (
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
      )}

      {!embedded && (
        <section className="grid gap-4" aria-label="Student registrations">
          <h2 className="text-xl font-semibold">
            Registrations and lesson schedule
          </h2>
          {student.signups?.length ? (
            student.signups.map((signup) => (
              <article
                key={signup.id}
                className="grid gap-3 rounded-xl border p-4"
              >
                <h3 className="font-semibold">
                  {signup.programName} · {signup.seasonName}
                </h3>
                <p className="text-sm">
                  {statusLabel(signup.status)} ·{" "}
                  {signup.disciplineLabel ?? "Discipline not set"} ·{" "}
                  {signup.abilityLevelLabel ?? "Ability not set"}
                </p>
                <RegistrationScheduleDetails schedule={signup.schedule} />
              </article>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              No registrations recorded.
            </p>
          )}
        </section>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
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
              <FieldLabel htmlFor="edit-student-last-name">
                Last name
              </FieldLabel>
              <Input
                id="edit-student-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                required
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="edit-student-date-of-birth">
              Date of birth
            </FieldLabel>
            <DatePicker
              id="edit-student-date-of-birth"
              value={dateOfBirth}
              onValueChange={setDateOfBirth}
              placeholder="Choose a birthdate"
              defaultMonth={
                dateOfBirth
                  ? undefined
                  : new Date(new Date().getFullYear() - 10, 0, 1)
              }
              startMonth={new Date(new Date().getFullYear() - 100, 0, 1)}
              endMonth={new Date()}
              disabledDates={{ after: new Date() }}
            />
            <FieldDescription>
              Optional for imported students. Record a confirmed birthdate when
              available.
            </FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="edit-student-discipline">
                Discipline
              </FieldLabel>
              <Select
                value={disciplineId || "none"}
                onValueChange={(value) =>
                  setDisciplineId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger id="edit-student-discipline">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {disciplines.map((discipline) => (
                    <SelectItem key={discipline.id} value={discipline.id}>
                      {discipline.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-student-level">
                Ability level
              </FieldLabel>
              <Select
                value={abilityLevelId || "none"}
                onValueChange={(value) =>
                  setAbilityLevelId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger id="edit-student-level">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {abilityLevels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>
          {student.surveyMedicalNotes?.map((note) => (
            <article
              key={note.sourceResponseId}
              className="rounded-lg border p-3"
            >
              <h3 className="font-medium">
                Survey medical note ·{" "}
                {note.sourceSubmittedAt
                  ? new Date(note.sourceSubmittedAt).toLocaleDateString()
                  : "Date unavailable"}
              </h3>
              <p className="whitespace-pre-wrap">{note.note}</p>
              {note.requiresReview &&
              !reviewed.includes(note.sourceResponseId ?? "") ? (
                <>
                  <p className="text-sm text-amber-700">Needs review</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={reviewing}
                    onClick={async () => {
                      if (!note.sourceResponseId) return;
                      setReviewing(true);
                      try {
                        await reviewSurveySupport({
                          data: {
                            studentId: student.id,
                            responseId: note.sourceResponseId,
                            requiresReview: false,
                          },
                        });
                        setReviewed((value) => [
                          ...value,
                          note.sourceResponseId!,
                        ]);
                      } catch (reviewError) {
                        setError(
                          reviewError instanceof Error
                            ? reviewError.message
                            : "Review could not be saved.",
                        );
                      } finally {
                        setReviewing(false);
                      }
                    }}
                  >
                    Mark reviewed
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Reviewed</p>
              )}
            </article>
          ))}
          <Field>
            <FieldLabel htmlFor="edit-medical-info">
              Medical/support information
            </FieldLabel>
            <Textarea
              id="edit-medical-info"
              value={medicalInfo}
              onChange={(event) => setMedicalInfo(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-student-notes">
              Placement notes
            </FieldLabel>
            <Textarea
              id="edit-student-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          {error ? (
            <Field data-invalid>
              <FieldError>{error}</FieldError>
            </Field>
          ) : null}

          <div className="bg-background sticky bottom-0 z-10 flex flex-col-reverse justify-end gap-2 border-t py-3 sm:flex-row">
            {onCancel ? (
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || isArchiving}
                onClick={onCancel}
              >
                Cancel
              </Button>
            ) : (
              <Button asChild type="button" variant="outline">
                <Link to="/admin/students">Cancel</Link>
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSaving || isArchiving || !isDirty}
            >
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
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm">
              <Archive data-icon="inline-start" />
              Archive student
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Archive {student.firstName} {student.lastName}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This removes the student and their active registrations from the
                working roster. Audit history is retained.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep student</AlertDialogCancel>
              <AlertDialogAction
                disabled={isArchiving}
                onClick={() => void handleArchive()}
              >
                {isArchiving ? "Archiving…" : "Archive"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}

function statusLabel(status: string | null) {
  if (!status) return "Active";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
