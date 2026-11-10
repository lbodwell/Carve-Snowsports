import { useId } from "react";
import { ChevronDown } from "lucide-react";
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

export type RegistrationScheduleDraft = {
  weekday: number;
  timeSlotId: string | null;
};

export function RegistrationScheduleEditor({
  schedule,
  slots,
  selection,
  onChange,
  disabled,
}: {
  schedule: RegistrationScheduleSummary;
  slots: ReadonlyArray<RegistrationScheduleOption>;
  selection?: RegistrationScheduleDraft | null;
  onChange?: (schedule: RegistrationScheduleDraft | null) => void;
  disabled: boolean;
}) {
  const eligibleSlots = slots.filter(
    (slot) =>
      !schedule.requiredCohort || slot.cohort === schedule.requiredCohort,
  );
  const days = [
    ...new Set(eligibleSlots.flatMap((slot) => slot.allowedWeekdays)),
  ].sort((a, b) => a - b);
  const savedDay =
    schedule.resolved?.weekday ??
    weekdayNames.findIndex((day) => day === schedule.weekday);
  const savedSlotId = schedule.resolved?.timeSlotId ?? null;
  const weekday = selection?.weekday ?? savedDay;
  const timeSlotId = selection ? selection.timeSlotId : savedSlotId;
  const timePlaceholder =
    !selection && !savedSlotId && schedule.hours
      ? `${formatLessonHours(schedule.hours)} · Needs review`
      : "Select time";
  const times = eligibleSlots
    .filter((slot) => slot.allowedWeekdays.includes(weekday))
    .sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) ||
        a.endsAt.localeCompare(b.endsAt) ||
        a.label.localeCompare(b.label),
    )
    .map((slot) => ({
      value: slot.id,
      label: slot.label,
      cohort: slot.cohort,
      hours: formatLessonHours(
        `${slot.startsAt.slice(0, 5)}–${slot.endsAt.slice(0, 5)}`,
      ),
    }));
  const currentLabel = [schedule.weekday, registrationTimeLabel(schedule)]
    .filter(Boolean)
    .join(" · ");

  if (!onChange || !days.length)
    return (
      <dl className="grid gap-1 text-sm">
        <dt className="text-muted-foreground">Lesson day and time</dt>
        <dd>{currentLabel}</dd>
      </dl>
    );

  function change(day: number, slotId: string | null) {
    onChange?.(
      day === savedDay && slotId === savedSlotId
        ? null
        : { weekday: day, timeSlotId: slotId },
    );
  }

  return (
    <div className="grid min-w-0 gap-x-4 gap-y-2 sm:grid-cols-2">
      <ScheduleSelect
        label="Day"
        value={days.includes(weekday) ? String(weekday) : ""}
        disabled={disabled}
        placeholder="Select day"
        options={days.map((day) => ({
          value: String(day),
          label: weekdayNames[day]!,
        }))}
        onChange={(value) => {
          const day = Number(value);
          const compatible = eligibleSlots.some(
            (slot) =>
              slot.id === timeSlotId && slot.allowedWeekdays.includes(day),
          );
          change(
            day,
            compatible ? timeSlotId : day === savedDay ? savedSlotId : null,
          );
        }}
      />
      <ScheduleSelect
        label="Time"
        value={timeSlotId ?? ""}
        disabled={disabled || !times.length}
        placeholder={timePlaceholder}
        options={times.map(({ value, hours, label, cohort }) => {
          const duplicates = times.filter(
            (time) => time.value !== value && time.hours === hours,
          );
          const session =
            cohort === "session-1"
              ? "Session 1"
              : cohort === "session-2"
                ? "Session 2"
                : null;
          const suffix = duplicates.some((time) => time.cohort === cohort)
            ? label
            : (session ?? (duplicates.length ? label : null));
          return {
            value,
            label: suffix ? `${hours} · ${suffix}` : hours,
          };
        })}
        onChange={(value) => change(weekday, value || null)}
      />
      {selection?.timeSlotId === null && (
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Select a time to save this change.
        </p>
      )}
    </div>
  );
}

function ScheduleSelect({
  label,
  value,
  disabled,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <div className="relative">
        <select
          id={fieldId}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full appearance-none truncate rounded-lg border pr-8 pl-2.5 text-sm outline-none focus-visible:ring-3 disabled:opacity-50"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
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
