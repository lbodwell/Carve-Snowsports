import { describe, expect, it } from "vitest";
import {
  overlappingStudentRegistrations,
  resolveRegistrationSchedule,
} from "./registration-schedule";

const slots = [
  { id: "morning", label: "10am" },
  { id: "afternoon", label: "1pm" },
];

describe("imported registration sessions", () => {
  it("resolves Thursday and Friday cohorts at 9am without merging their identities", () => {
    const weekdaySlots = [1, 2].map((n) => ({
      id: `session-${n}`,
      label: `9:00 AM - Session ${n}`,
      cohort: `session-${n}`,
      startsAt: "09:00",
      endsAt: "12:00",
      allowedWeekdays: [4, 5],
    }));
    for (const [weekday, day] of [
      ["Thursday", 4],
      ["Friday", 5],
    ] as const) {
      for (const n of [1, 2])
        expect(
          resolveRegistrationSchedule(
            { weekday, session: `Session ${n}` },
            weekdaySlots,
          ),
        ).toEqual({ weekday: day, timeSlotId: `session-${n}` });
    }
    expect(
      resolveRegistrationSchedule(
        { weekday: "Thursday", session: "Session 2" },
        weekdaySlots.slice(0, 1),
      ),
    ).toBeNull();
    expect(
      resolveRegistrationSchedule(
        { weekday: "Thursday", session: "Session 1" },
        [...weekdaySlots, { ...weekdaySlots[0]!, id: "duplicate" }],
      ),
    ).toBeNull();
  });
  it("flags the same child's overlapping enrollments while allowing separate sessions", () => {
    const times = [
      { id: "morning", startsAt: "09:00", endsAt: "12:00" },
      { id: "full", startsAt: "09:00", endsAt: "15:00" },
      { id: "afternoon", startsAt: "13:00", endsAt: "15:00" },
    ];
    const base = {
      studentId: "child",
      schedule: { weekday: 6, timeSlotId: "morning" },
    };
    const fallback = { weekday: 6, timeSlotId: "morning" };
    expect([
      ...overlappingStudentRegistrations(
        [
          { ...base, id: "one" },
          { ...base, id: "two", schedule: { weekday: 6, timeSlotId: "full" } },
        ],
        times,
        fallback,
      ),
    ]).toEqual(["one", "two"]);
    expect(
      overlappingStudentRegistrations(
        [
          { ...base, id: "one" },
          {
            ...base,
            id: "two",
            schedule: { weekday: 6, timeSlotId: "afternoon" },
          },
        ],
        times,
        fallback,
      ).size,
    ).toBe(0);
  });
  it("uses an exact unique day and session label", () => {
    expect(
      resolveRegistrationSchedule(
        { weekday: "Saturday", session: "10am" },
        slots,
      ),
    ).toEqual({ weekday: 6, timeSlotId: "morning" });
  });
  it("never guesses full-day or numbered session mappings", () => {
    for (const session of ["Session 1", "Session 2", "Full Day", "PM", ""])
      expect(
        resolveRegistrationSchedule({ weekday: "Saturday", session }, slots),
      ).toBeNull();
  });
  it("honors a reviewed mapping while the slot exists", () => {
    const source = {
      weekday: "Friday",
      session: "Session 1",
      groupingSchedule: { weekday: 5, timeSlotId: "morning" },
    };
    const cohortSlots = [
      { id: "morning", label: "Session 1 AM", cohort: "session-1" },
    ];
    expect(resolveRegistrationSchedule(source, slots)).toBeNull();
    expect(resolveRegistrationSchedule(source, cohortSlots)).toEqual({
      weekday: 5,
      timeSlotId: "morning",
    });
    expect(resolveRegistrationSchedule(source, [])).toBeNull();
  });
  it("matches the school's verified weekend AM, PM and full-day hours", () => {
    expect(
      resolveRegistrationSchedule(
        { weekday: "Saturday", session: "Full Day" },
        [
          {
            id: "incorrect",
            label: "Full Day",
            startsAt: "09:00",
            endsAt: "12:00",
          },
        ],
      ),
    ).toBeNull();
    const times = [
      { id: "am", label: "Morning", startsAt: "10:00:00", endsAt: "12:00:00" },
      { id: "pm", label: "Afternoon", startsAt: "13:00", endsAt: "15:00" },
      { id: "full", label: "All day", startsAt: "10:00", endsAt: "15:00" },
    ];
    for (const [label, id] of [
      ["10am", "am"],
      ["1pm", "pm"],
      ["Full Day", "full"],
    ])
      expect(
        resolveRegistrationSchedule(
          { weekday: "Sunday", session: label },
          times,
        ),
      ).toEqual({ weekday: 0, timeSlotId: id });
    expect(
      resolveRegistrationSchedule(
        { weekday: "Sunday", session: "Session 1" },
        times,
      ),
    ).toBeNull();
    expect(
      resolveRegistrationSchedule(
        { weekday: "Monday", session: "Full Day" },
        times,
      ),
    ).toBeNull();
  });
  it("rejects ambiguous labels and invalid days", () => {
    expect(
      resolveRegistrationSchedule({ weekday: "Saturday", session: "10am" }, [
        ...slots,
        { id: "duplicate", label: "10am" },
      ]),
    ).toBeNull();
    expect(
      resolveRegistrationSchedule(
        { weekday: "Holiday", session: "10am" },
        slots,
      ),
    ).toBeNull();
    expect(
      resolveRegistrationSchedule(
        { groupingSchedule: { weekday: 7, timeSlotId: "morning" } },
        slots,
      ),
    ).toBeNull();
  });
});
