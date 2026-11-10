import type { SessionCalendar } from "@/domain/calendar/session-calendar";
import { parseProductDimensions } from "@/domain/imports/aspenware-registration";
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
  const cohort = importedCohort(source);
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
        ((!source.sourceKey && !source.session) ||
          (slot.cohort ?? "season") === cohort) &&
        (slot.allowedWeekdays === undefined ||
          slot.allowedWeekdays.includes(explicit.weekday!)),
    )
  ) {
    return { weekday: explicit.weekday!, timeSlotId: explicit.timeSlotId! };
  }
  const weekday = weekdayNames.findIndex(
    (day) => day.toLowerCase() === String(source.weekday).toLowerCase(),
  );
  const available = slots.filter(
    (slot) =>
      slot.allowedWeekdays === undefined ||
      slot.allowedWeekdays.includes(weekday),
  );
  const label = String(source.session ?? "")
    .trim()
    .toLowerCase();
  const lessonTime =
    String(source.lessonTime ?? "")
      .trim()
      .toLowerCase() ||
    (typeof source.product === "string"
      ? parseProductDimensions(source.product).lessonTime
      : null) ||
    "";
  const clock = (lessonTime || label)
    .replace(/\s+/g, "")
    .match(/^(\d{1,2})(?::([0-5]\d))?(am|pm)$/);
  const startTime =
    clock && Number(clock[1]) >= 1 && Number(clock[1]) <= 12
      ? `${String((Number(clock[1]) % 12) + (clock[3] === "pm" ? 12 : 0)).padStart(2, "0")}:${clock[2] ?? "00"}`
      : null;
  const weekendHours =
    label === "10am" || label === "am"
      ? ["10:00", "12:00"]
      : label === "1pm" || label === "pm"
        ? ["13:00", "15:00"]
        : label === "full day"
          ? ["10:00", "15:00"]
          : null;
  const matches = available.filter(
    (slot) =>
      (slot.cohort ?? "season") === cohort &&
      slot.label.trim().toLowerCase() === label &&
      (!lessonTime ||
        !slot.startsAt ||
        slot.startsAt.slice(0, 5) === startTime) &&
      (!(weekday === 0 || weekday === 6) ||
        !weekendHours ||
        !slot.startsAt ||
        !slot.endsAt ||
        (slot.startsAt.slice(0, 5) === weekendHours[0] &&
          slot.endsAt.slice(0, 5) === weekendHours[1])),
  );
  const clockMatches =
    weekday === 0 || weekday === 6
      ? available.filter(
          (slot) =>
            (slot.cohort ?? "season") === "season" &&
            weekendHours &&
            slot.startsAt?.slice(0, 5) === weekendHours[0] &&
            slot.endsAt?.slice(0, 5) === weekendHours[1],
        )
      : [];
  const weekdayCohortMatches =
    (weekday === 4 || weekday === 5) && cohort !== "season"
      ? available.filter(
          (slot) =>
            slot.cohort === cohort &&
            slot.startsAt?.slice(0, 5) === (startTime ?? "09:30") &&
            slot.endsAt?.slice(0, 5) ===
              (startTime === "13:00" ? "15:00" : "11:00"),
        )
      : [];
  const candidates = matches.length
    ? matches
    : weekdayCohortMatches.length
      ? weekdayCohortMatches
      : startTime
        ? available.filter(
            (slot) =>
              (slot.cohort ?? "season") === cohort &&
              slot.startsAt?.slice(0, 5) === startTime &&
              (!slot.endsAt ||
                slot.endsAt.slice(0, 5) <=
                  (clock?.[3] === "am" ? "12:30" : "23:59")),
          )
        : clockMatches;
  return weekday >= 0 && candidates.length === 1
    ? { weekday, timeSlotId: candidates[0]!.id }
    : null;
}
