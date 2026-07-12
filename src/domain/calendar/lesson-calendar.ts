export type WeeklyRecurrence = {
  weekday: number;
  timeSlotId: string;
};

export type LessonCalendarInput = {
  startsOn: string;
  endsOn: string;
  recurrences: Array<WeeklyRecurrence>;
  excludedDates: ReadonlySet<string>;
};

export type PlannedLesson = {
  lessonDate: string;
  timeSlotId: string;
};

function parseIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function generateLessonCalendar(
  input: LessonCalendarInput,
): Array<PlannedLesson> {
  const startsOn = parseIsoDate(input.startsOn);
  const endsOn = parseIsoDate(input.endsOn);

  if (endsOn < startsOn) {
    throw new Error("Season end date must be on or after the start date.");
  }

  const recurrenceKeys = new Set(
    input.recurrences.map(
      (recurrence) => `${recurrence.weekday}:${recurrence.timeSlotId}`,
    ),
  );
  if (recurrenceKeys.size !== input.recurrences.length) {
    throw new Error(
      "A recurrence cannot repeat the same weekday and time slot.",
    );
  }

  const lessons: Array<PlannedLesson> = [];
  for (
    const cursor = new Date(startsOn);
    cursor <= endsOn;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const lessonDate = toIsoDate(cursor);
    for (const recurrence of input.recurrences) {
      if (
        cursor.getUTCDay() !== recurrence.weekday ||
        input.excludedDates.has(lessonDate)
      ) {
        continue;
      }
      lessons.push({ lessonDate, timeSlotId: recurrence.timeSlotId });
    }
  }

  return lessons.sort((a, b) =>
    a.lessonDate === b.lessonDate
      ? a.timeSlotId.localeCompare(b.timeSlotId)
      : a.lessonDate.localeCompare(b.lessonDate),
  );
}
