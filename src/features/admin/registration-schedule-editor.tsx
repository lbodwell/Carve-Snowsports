import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FormEvent } from "react";
import type {
  RegistrationScheduleOption,
  RegistrationScheduleSummary,
} from "@/domain/imports/registration-schedule-summary";
import { Button } from "@/components/ui/button";
import { FieldError, FieldLabel } from "@/components/ui/field";
import { weekdayNames } from "@/domain/grouping/registration-schedule";
import {
  formatLessonHours,
  registrationTimeLabel,
} from "@/domain/imports/registration-schedule-summary";
import { saveRegistrationSchedule } from "@/server/functions/grouping-draft";

export function RegistrationScheduleEditor({
  registrationId,
  schedule,
  slots,
  onSaved,
  onBusyChange,
}: {
  registrationId: string | null;
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
        label: `${weekdayNames[weekday]} · ${formatLessonHours(`${slot.startsAt.slice(0, 5)}–${slot.endsAt.slice(0, 5)}`)} · ${slot.label}`,
      })),
    )
    .sort((a, b) => a.weekday - b.weekday || a.label.localeCompare(b.label));
  const current = schedule.resolved
    ? `${schedule.resolved.weekday}:${schedule.resolved.timeSlotId}`
    : "";
  const chosen = options.find((option) => option.key === selection);
  const changed = chosen && chosen.key !== current;
  const currentLabel = [schedule.weekday, registrationTimeLabel(schedule)]
    .filter(Boolean)
    .join(" · ");

  function reset() {
    setSelection(null);
    setError("");
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!registrationId || !changed || saving) return;
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

  if (!registrationId || !options.length)
    return (
      <dl className="grid gap-1 text-sm">
        <dt className="text-muted-foreground">Lesson day and time</dt>
        <dd>{currentLabel}</dd>
      </dl>
    );

  return (
    <form className="grid min-w-0 gap-1.5" onSubmit={handleSubmit}>
      <FieldLabel htmlFor={fieldId}>Lesson day and time</FieldLabel>
      <div className="relative">
        <select
          id={fieldId}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full appearance-none truncate rounded-lg border pr-8 pl-2.5 text-sm outline-none focus-visible:ring-3"
          value={selection ?? current}
          disabled={saving}
          onChange={(event) => {
            setSelection(event.target.value);
            setError("");
            setSaved(false);
          }}
        >
          <option value="" disabled>
            {currentLabel}
          </option>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
        />
      </div>
      {changed && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={saving}
          >
            Discard time change
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving time…" : "Save lesson time"}
          </Button>
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
      {saved && (
        <p role="status" className="text-muted-foreground text-sm">
          Lesson time saved.
        </p>
      )}
    </form>
  );
}
