import { describe, expect, it } from "vitest";

import { generateLessonCalendar } from "@/domain/calendar/lesson-calendar";

describe("generateLessonCalendar", () => {
  it("creates dated instances and honors excluded dates", () => {
    expect(
      generateLessonCalendar({
        startsOn: "2026-01-01",
        endsOn: "2026-01-10",
        recurrences: [{ weekday: 6, timeSlotId: "am" }],
        excludedDates: new Set(["2026-01-03"]),
      }),
    ).toEqual([{ lessonDate: "2026-01-10", timeSlotId: "am" }]);
  });

  it("rejects duplicate recurrences", () => {
    expect(() =>
      generateLessonCalendar({
        startsOn: "2026-01-01",
        endsOn: "2026-01-02",
        recurrences: [
          { weekday: 1, timeSlotId: "am" },
          { weekday: 1, timeSlotId: "am" },
        ],
        excludedDates: new Set(),
      }),
    ).toThrow("cannot repeat");
  });
});
