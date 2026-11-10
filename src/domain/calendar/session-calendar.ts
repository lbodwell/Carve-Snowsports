import { generateLessonCalendar } from "./lesson-calendar";
import { rangesOverlap } from "./time-ranges";
import { parseProductDimensions } from "@/domain/imports/aspenware-registration";

export type SessionCalendar = {
  startsAt: string;
  endsAt: string;
  startsOn?: string | null;
  endsOn?: string | null;
  excludedDates?: ReadonlyArray<string>;
  cohort?: string;
  allowedWeekdays?: ReadonlyArray<number>;
};

/** Undated slots retain the season-wide behavior; explicit cohorts use real dates. */
export function sessionsOverlap(
  a: SessionCalendar,
  b: SessionCalendar,
  weekday: number,
) {
  // The school defines these as separate seasonal cohorts, even while dates
  // are pending. Publication requires their actual dates.
  if (
    a.cohort &&
    b.cohort &&
    a.cohort !== "season" &&
    b.cohort !== "season" &&
    a.cohort !== b.cohort
  )
    return false;
  if (!rangesOverlap(a, b)) return false;
  const startsOn = [a.startsOn, b.startsOn]
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const endsOn = [a.endsOn, b.endsOn]
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  if (!startsOn || !endsOn) return true;
  if (endsOn < startsOn) return false;
  return (
    generateLessonCalendar({
      startsOn,
      endsOn,
      recurrences: [{ weekday, timeSlotId: "overlap" }],
      excludedDates: new Set([
        ...(a.excludedDates ?? []),
        ...(b.excludedDates ?? []),
      ]),
    }).length > 0
  );
}

export function importedCohort(source: Record<string, unknown> | null) {
  let label = String(source?.session ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  // Older imports could store the clock token in place of the numbered session.
  if (
    typeof source?.product === "string" &&
    /^1(?::00)?pm$/.test(label) &&
    String(source.weekday).toLowerCase() === "friday"
  )
    label =
      parseProductDimensions(source.product)
        .session?.toLowerCase()
        .replace(/\s+/g, "") ?? label;
  return label === "session1"
    ? "session-1"
    : label === "session2"
      ? "session-2"
      : "season";
}

export function sessionLessons(
  slot: Pick<SessionCalendar, "startsOn" | "endsOn" | "excludedDates">,
  season: { startsOn: string; endsOn: string },
  weekday: number,
  timeSlotId: string,
) {
  return generateLessonCalendar({
    startsOn:
      slot.startsOn && slot.startsOn > season.startsOn
        ? slot.startsOn
        : season.startsOn,
    endsOn:
      slot.endsOn && slot.endsOn < season.endsOn ? slot.endsOn : season.endsOn,
    excludedDates: new Set(slot.excludedDates ?? []),
    recurrences: [{ weekday, timeSlotId }],
  });
}
