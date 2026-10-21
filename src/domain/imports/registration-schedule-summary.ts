import { importedCohort } from "@/domain/calendar/session-calendar";
import {
  resolveRegistrationSchedule,
  weekdayNames,
} from "@/domain/grouping/registration-schedule";

export type ScheduleSlot = {
  id: string;
  label: string;
  cohort: string;
  startsAt: string;
  endsAt: string;
  startsOn: string | null;
  endsOn: string | null;
  excludedDates: Array<string>;
};

export function registrationScheduleSummary(
  source: Record<string, unknown> | null,
  slots: ReadonlyArray<ScheduleSlot>,
  season?: { startsOn: string; endsOn: string },
) {
  const text = (key: string) =>
    typeof source?.[key] === "string" ? source[key] : null;
  const resolved = resolveRegistrationSchedule(source, slots);
  const slot = slots.find((item) => item.id === resolved?.timeSlotId);
  const weekday = resolved ? weekdayNames[resolved.weekday]! : text("weekday");
  const session = slot?.label ?? text("session");
  const weekend = weekday === "Saturday" || weekday === "Sunday";
  const importedHours = weekend
    ? (
        {
          "10am": "10:00–12:00",
          "1pm": "13:00–15:00",
          "full day": "10:00–15:00",
        } as Record<string, string>
      )[text("session")?.toLowerCase() ?? ""]
    : null;
  const cohort = slot?.cohort ?? importedCohort(source);
  return {
    weekday,
    session,
    hours: slot
      ? `${slot.startsAt.slice(0, 5)}–${slot.endsAt.slice(0, 5)}`
      : (importedHours ?? null),
    cohort:
      cohort === "session-1"
        ? "Session 1"
        : cohort === "session-2"
          ? "Session 2"
          : "Regular season",
    productDate: text("productDate"),
    saleDate: text("saleDate"),
    product: text("product"),
    ageBand: text("ageBand"),
    startsOn: slot
      ? (slot.startsOn ??
        (cohort === "season" ? season?.startsOn : null) ??
        null)
      : null,
    endsOn: slot
      ? (slot.endsOn ?? (cohort === "season" ? season?.endsOn : null) ?? null)
      : null,
    excludedDates: slot?.excludedDates ?? [],
    status: resolved
      ? "Session matched"
      : source?.sourceKey
        ? "Needs session review"
        : "Schedule not recorded",
  };
}

export type RegistrationScheduleSummary = ReturnType<
  typeof registrationScheduleSummary
>;
