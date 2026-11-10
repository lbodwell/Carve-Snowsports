import { useId, useState } from "react";
import type { FormEvent } from "react";
import type {
  RegistrationScheduleOption,
  RegistrationScheduleSummary,
} from "@/domain/imports/registration-schedule-summary";
import { Button } from "@/components/ui/button";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { weekdayNames } from "@/domain/grouping/registration-schedule";
import { saveRegistrationSchedule } from "@/server/functions/grouping-draft";

export function RegistrationScheduleEditor({
  registrationId,
  schedule,
  slots,
  onSaved,
  onBusyChange,
}: {
  registrationId: string;
  schedule: RegistrationScheduleSummary;
  slots: ReadonlyArray<RegistrationScheduleOption>;
  onSaved: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const fieldId = useId();
  const [selection, setSelection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const options = slots
    .filter(
      (slot) =>
        !schedule.requiredCohort || slot.cohort === schedule.requiredCohort,
    )
    .flatMap((slot) =>
      slot.allowedWeekdays.map((weekday) => ({
        key: `${weekday}:${slot.id}`,
        weekday,
        timeSlotId: slot.id,
        label: `${weekdayNames[weekday]} · ${slot.label} · ${slot.startsAt.slice(0, 5)}–${slot.endsAt.slice(0, 5)}`,
      })),
    )
    .sort((a, b) => a.weekday - b.weekday || a.label.localeCompare(b.label));
  const current = schedule.resolved
    ? `${schedule.resolved.weekday}:${schedule.resolved.timeSlotId}`
    : "";
  const chosen = options.find((option) => option.key === selection);
  const canSave = chosen && chosen.key !== current && !saving;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    onBusyChange?.(true);
    try {
      await saveRegistrationSchedule({
        data: {
          registrationId,
          weekday: chosen.weekday,
          timeSlotId: chosen.timeSlotId,
        },
      });
      await onSaved();
      setSelection(null);
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The lesson time could not be saved.",
      );
    } finally {
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  if (!options.length)
    return (
      <p className="text-muted-foreground text-sm">
        No lesson times are configured for this registration.
      </p>
    );

  return (
    <form className="grid gap-2" onSubmit={handleSubmit}>
      <FieldLabel htmlFor={fieldId}>Registered lesson time</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <select
          id={fieldId}
          className="border-input bg-background min-h-9 min-w-0 grow rounded-md border px-2 text-sm"
          value={selection ?? current}
          disabled={saving}
          onChange={(event) => {
            setSelection(event.target.value);
            setSaved(false);
          }}
        >
          <option value="" disabled>
            Choose a lesson time
          </option>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" disabled={!canSave}>
          {saving ? "Saving time…" : "Save lesson time"}
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
      {saved && (
        <p role="status" className="text-muted-foreground text-sm">
          Lesson time saved.
        </p>
      )}
    </form>
  );
}
