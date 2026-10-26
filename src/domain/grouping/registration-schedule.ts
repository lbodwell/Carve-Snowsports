import type { SessionCalendar } from "@/domain/calendar/session-calendar";
import {
  importedCohort,
  sessionsOverlap,
} from "@/domain/calendar/session-calendar";

export const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type RegistrationSchedule = { weekday: number; timeSlotId: string };

export function overlappingStudentRegistrations(
  registrations: ReadonlyArray<{
    id: string;
    studentId?: string;
    schedule?: RegistrationSchedule | null;
    needsSchedule?: boolean;
  }>,
  slots: ReadonlyArray<SessionCalendar & { id: string }>,
  fallback: RegistrationSchedule,
) {
  const duplicates = new Set<string>();
  for (const registration of registrations) {
    if (!registration.studentId || registration.needsSchedule) continue;
    const schedule = registration.schedule ?? fallback;
    const slot = slots.find((item) => item.id === schedule.timeSlotId);
    for (const other of registrations) {
      if (
        other.id === registration.id ||
        other.studentId !== registration.studentId ||
        other.needsSchedule
      )
        continue;
      const otherSchedule = other.schedule ?? fallback;
      const otherSlot = slots.find(
        (item) => item.id === otherSchedule.timeSlotId,
      );
      if (
        schedule.weekday === otherSchedule.weekday &&
        slot &&
        otherSlot &&
        sessionsOverlap(slot, otherSlot, schedule.weekday)
      ) {
        duplicates.add(registration.id);
        duplicates.add(other.id);
      }
    }
  }
  return duplicates;
}

export function resolveRegistrationSchedule(
  source: Record<string, unknown> | null,
  slots: ReadonlyArray<{
    id: string;
    label: string;
    cohort?: string;
    allowedWeekdays?: ReadonlyArray<number>;
    startsAt?: string;
    endsAt?: string;
  }>,
): RegistrationSchedule | null {
  if (!source) return null;
  const explicit = source.groupingSchedule as
    Partial<RegistrationSchedule> | undefined;
  if (
    explicit &&
    Number.isInteger(explicit.weekday) &&
    explicit.weekday! >= 0 &&
    explicit.weekday! <= 6 &&
    slots.some(
      (slot) =>
        slot.id === explicit.timeSlotId &&
        (slot.cohort ?? "season") === importedCohort(source) &&
        (slot.allowedWeekdays === undefined ||
          slot.allowedWeekdays.includes(explicit.weekday!)),
    )
  ) {
    return { weekday: explicit.weekday!, timeSlotId: explicit.timeSlotId! };
  }
  const weekday = weekdayNames.findIndex(
    (day) => day.toLowerCase() === String(source.weekday).toLowerCase(),
  );
  const label = String(source.session ?? "")
    .trim()
    .toLowerCase();
  const weekendHours =
    label === "10am" || label === "am"
      ? ["10:00", "12:00"]
      : label === "1pm" || label === "pm"
        ? ["13:00", "15:00"]
        : label === "full day"
          ? ["10:00", "15:00"]
          : null;
  const matches = slots.filter(
    (slot) =>
      (slot.cohort ?? "season") === importedCohort(source) &&
      slot.label.trim().toLowerCase() === label &&
      (!(weekday === 0 || weekday === 6) ||
        !weekendHours ||
        !slot.startsAt ||
        !slot.endsAt ||
        (slot.startsAt.slice(0, 5) === weekendHours[0] &&
          slot.endsAt.slice(0, 5) === weekendHours[1])),
  );
  const clockMatches =
    weekday === 0 || weekday === 6
      ? slots.filter(
          (slot) =>
            (slot.cohort ?? "season") === "season" &&
            weekendHours &&
            slot.startsAt?.slice(0, 5) === weekendHours[0] &&
            slot.endsAt?.slice(0, 5) === weekendHours[1],
        )
      : [];
  const weekdayCohortMatches =
    (weekday === 4 || weekday === 5) && importedCohort(source) !== "season"
      ? slots.filter(
          (slot) =>
            slot.cohort === importedCohort(source) &&
            slot.startsAt?.slice(0, 5) === "09:00",
        )
      : [];
  const candidates = (
    matches.length
      ? matches
      : weekdayCohortMatches.length
        ? weekdayCohortMatches
        : clockMatches
  ).filter(
    (slot) =>
      slot.allowedWeekdays === undefined ||
      slot.allowedWeekdays.includes(weekday),
  );
  return weekday >= 0 && candidates.length === 1
    ? { weekday, timeSlotId: candidates[0]!.id }
    : null;
}
