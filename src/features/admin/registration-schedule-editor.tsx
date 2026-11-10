import { useId } from "react";
import { ChevronDown } from "lucide-react";
import type { RegistrationSchedule } from "@/domain/grouping/registration-schedule";
import type {
  RegistrationScheduleOption,
  RegistrationScheduleSummary,
} from "@/domain/imports/registration-schedule-summary";
import { FieldLabel } from "@/components/ui/field";
import { weekdayNames } from "@/domain/grouping/registration-schedule";
import {
  formatLessonHours,
  registrationTimeLabel,
} from "@/domain/imports/registration-schedule-summary";

export function RegistrationScheduleEditor({
  schedule,
  slots,
  selection,
  onChange,
  disabled,
}: {
  schedule: RegistrationScheduleSummary;
  slots: ReadonlyArray<RegistrationScheduleOption>;
  selection?: RegistrationSchedule | null;
  onChange?: (schedule: RegistrationSchedule | null) => void;
  disabled: boolean;
}) {
  const fieldId = useId();
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
  const value = selection
    ? `${selection.weekday}:${selection.timeSlotId}`
    : current;
  const currentLabel = [schedule.weekday, registrationTimeLabel(schedule)]
    .filter(Boolean)
    .join(" · ");

  if (!onChange || !options.length)
    return (
      <dl className="grid gap-1 text-sm">
        <dt className="text-muted-foreground">Lesson day and time</dt>
        <dd>{currentLabel}</dd>
      </dl>
    );

  return (
    <div className="grid min-w-0 gap-1.5">
      <FieldLabel htmlFor={fieldId}>Lesson day and time</FieldLabel>
      <div className="relative">
        <select
          id={fieldId}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full appearance-none truncate rounded-lg border pr-8 pl-2.5 text-sm outline-none focus-visible:ring-3"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const chosen = options.find(
              (option) => option.key === event.target.value,
            );
            onChange(
              chosen && chosen.key !== current
                ? { weekday: chosen.weekday, timeSlotId: chosen.timeSlotId }
                : null,
            );
          }}
        >
          <option value="" disabled={Boolean(current)}>
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
    </div>
  );
}
