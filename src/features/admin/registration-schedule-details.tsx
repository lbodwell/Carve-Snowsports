import type { RegistrationScheduleSummary } from "@/domain/imports/registration-schedule-summary";

export function RegistrationScheduleDetails({
  schedule,
}: {
  schedule: RegistrationScheduleSummary;
}) {
  const fields = [
    ["Lesson day", schedule.weekday ?? "Not recorded"],
    ["Session", schedule.session ?? "Not recorded"],
    ["Lesson hours", schedule.hours ?? "Hours pending"],
    ["Seasonal cohort", schedule.cohort],
    [
      "Lesson date range",
      schedule.startsOn && schedule.endsOn
        ? `${schedule.startsOn} to ${schedule.endsOn}`
        : "Dates pending configuration",
    ],
    ["Aspenware product date", schedule.productDate ?? "Not recorded"],
    ["Purchase date", schedule.saleDate ?? "Not recorded"],
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
      <p className="text-muted-foreground text-xs">
        The Aspenware product date is the date on the export. Recurring lesson
        dates depend on the configured lesson calendar.
      </p>
    </div>
  );
}
