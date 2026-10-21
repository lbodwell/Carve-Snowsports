import type { RegistrationScheduleSummary } from "@/domain/imports/registration-schedule-summary";
import { registrationTimeLabel } from "@/domain/imports/registration-schedule-summary";

export function RegistrationScheduleDetails({
  schedule,
}: {
  schedule: RegistrationScheduleSummary;
}) {
  const fields = [
    ["Lesson day", schedule.weekday ?? "Not recorded"],
    ["Time", registrationTimeLabel(schedule)],
    ["Seasonal cohort", schedule.cohort],
    [
      "Lesson date range",
      schedule.startsOn && schedule.endsOn
        ? `${schedule.startsOn} to ${schedule.endsOn}`
        : "Dates pending configuration",
    ],
    ["Purchased age band", schedule.ageBand ?? "Not recorded"],
    ["Schedule status", schedule.status],
  ];
  return (
    <div className="grid gap-3">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {schedule.excludedDates.length > 0 && (
        <p className="text-sm">
          No lessons: {schedule.excludedDates.join(", ")}
        </p>
      )}
      {schedule.product && (
        <p className="text-muted-foreground text-xs">
          Purchased product: {schedule.product}
        </p>
      )}
    </div>
  );
}
