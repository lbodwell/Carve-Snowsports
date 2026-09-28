import { Link } from "@tanstack/react-router";
import { ArrowLeft, UserPlus } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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
import { createStudent } from "@/server/functions/student-roster";

type NewStudentFormProps = {
  abilityLevels: Array<{ id: string; label: string }>;
  disciplines: Array<{ id: string; label: string }>;
  programName: string | null;
  onCreated: () => void;
};

export function NewStudentForm({
  abilityLevels,
  disciplines,
  onCreated,
  programName,
}: NewStudentFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [disciplineId, setDisciplineId] = useState(disciplines[0]?.id ?? "");
  const [abilityLevelId, setAbilityLevelId] = useState(
    abilityLevels[0]?.id ?? "",
  );
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [medicalInfo, setMedicalInfo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await createStudent({
        data: {
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
      onCreated();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The student could not be created. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="student-first-name">First name</FieldLabel>
            <Input
              id="student-first-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="student-last-name">Last name</FieldLabel>
            <Input
              id="student-last-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="student-date-of-birth">
              Date of birth
            </FieldLabel>
            <DatePicker
              id="student-date-of-birth"
              value={dateOfBirth}
              onValueChange={setDateOfBirth}
              placeholder="Choose a birthdate"
              defaultMonth={new Date(new Date().getFullYear() - 10, 0, 1)}
              startMonth={new Date(new Date().getFullYear() - 100, 0, 1)}
              endMonth={new Date()}
              disabledDates={{ after: new Date() }}
              required
            />
            <FieldDescription>
              Carve stores a date of birth rather than a mutable age.
            </FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="student-discipline">Discipline</FieldLabel>
              <Select
                value={disciplineId || "none"}
                onValueChange={(value) =>
                  setDisciplineId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger id="student-discipline">
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
              <FieldLabel htmlFor="student-level">Ability level</FieldLabel>
              <Select
                value={abilityLevelId || "none"}
                onValueChange={(value) =>
                  setAbilityLevelId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger id="student-level">
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
          {[
            ["Guardian name", guardianName, setGuardianName, "text"],
            ["Guardian phone", guardianPhone, setGuardianPhone, "tel"],
            ["Guardian email", guardianEmail, setGuardianEmail, "email"],
          ].map(([label, value, setter, type]) => (
            <Field key={String(label)}>
              <FieldLabel>{String(label)}</FieldLabel>
              <Input
                type={String(type)}
                value={String(value)}
                onChange={(event) =>
                  (setter as React.Dispatch<React.SetStateAction<string>>)(
                    event.target.value,
                  )
                }
              />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="student-medical">
              Medical/support information
            </FieldLabel>
            <Textarea
              id="student-medical"
              value={medicalInfo}
              onChange={(event) => setMedicalInfo(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="student-notes">Placement notes</FieldLabel>
            <Textarea
              id="student-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </FieldGroup>

        <Field>
          <FieldDescription>
            This creates an active registration in{" "}
            {programName ?? "the active program"}.
          </FieldDescription>
        </Field>

        {error ? (
          <Field data-invalid>
            <FieldError>{error}</FieldError>
          </Field>
        ) : null}

        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <Button asChild type="button" variant="outline">
            <Link to="/admin/students">
              <ArrowLeft data-icon="inline-start" />
              Cancel
            </Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <UserPlus data-icon="inline-start" />
            {isSubmitting ? "Creating student…" : "Create student"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
