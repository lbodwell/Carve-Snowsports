import { expect, it } from "vitest";
import { resolveRegistrationSchedule } from "../grouping/registration-schedule";
import { surveyMatchesRegistrationSession } from "./enrichment-context";

it("keeps Friday morning, afternoon and numbered cohorts distinct", () => {
  const slots = [1, 2].flatMap((n) => [
    {
      id: `${n}-am`,
      label: `Session ${n} AM`,
      cohort: `session-${n}`,
      startsAt: "09:30",
      endsAt: "11:00",
      allowedWeekdays: [4, 5],
    },
    {
      id: `${n}-pm`,
      label: `Session ${n} Friday PM`,
      cohort: `session-${n}`,
      startsAt: "13:00",
      endsAt: "15:00",
      allowedWeekdays: [5],
    },
  ]);
  for (const n of [1, 2]) {
    const source = {
      weekday: "Friday",
      session: `Session ${n}`,
      lessonTime: "1pm",
    };
    expect(resolveRegistrationSchedule(source, slots)).toEqual({
      weekday: 5,
      timeSlotId: `${n}-pm`,
    });
    expect(
      resolveRegistrationSchedule(
        source,
        slots.map((slot) =>
          slot.id === `${n}-am` ? { ...slot, label: `Session ${n}` } : slot,
        ),
      ),
    ).toEqual({ weekday: 5, timeSlotId: `${n}-pm` });
    expect(
      surveyMatchesRegistrationSession(
        `friday-pm-1300-1500-session-${n}`,
        source,
        slots,
      ),
    ).toBe(true);
    expect(
      surveyMatchesRegistrationSession(
        `friday-am-0930-1100-session-${n}`,
        source,
        slots,
      ),
    ).toBe(false);
    expect(
      surveyMatchesRegistrationSession(
        `friday-pm-1300-1500-session-${n === 1 ? 2 : 1}`,
        source,
        slots,
      ),
    ).toBe(false);
    expect(
      resolveRegistrationSchedule({ ...source, weekday: "Thursday" }, slots),
    ).toBeNull();
    expect(
      resolveRegistrationSchedule(
        {
          ...source,
          lessonTime: "",
          product: `PM | Ski | Children's Seasonal Program | 26/27 | Friday | 4-6yrs | Session ${n} | 1pm`,
        },
        slots,
      ),
    ).toEqual({ weekday: 5, timeSlotId: `${n}-pm` });
  }
});
