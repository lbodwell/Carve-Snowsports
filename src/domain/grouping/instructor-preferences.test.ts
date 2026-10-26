import { describe, expect, it } from "vitest";
import {
  instructorAvailability,
  instructorPreferenceSchema,
} from "./instructor-preferences";

const preference = {
  weekday: 6,
  teachingSlot: "am" as const,
  startsAt: "00:00",
  endsAt: "23:59",
  minimumAge: null,
  maximumAge: null,
  minimumLevel: null,
  maximumLevel: null,
};
const session = {
  programId: "11111111-1111-4111-8111-111111111111",
  cohort: "session-2",
  weekday: 6,
  startsAt: "09:00",
  endsAt: "12:00",
};
describe("weekly instructor preferences", () => {
  it("requires each lesson type explicitly, even when Full is selected", () => {
    const full = { ...preference, teachingSlot: "full" as const };
    expect(instructorAvailability([full], session).eligible).toBe(false);
    expect(instructorAvailability([full, preference], session).eligible).toBe(
      true,
    );
    expect(
      instructorAvailability(
        [preference, { ...preference, teachingSlot: "pm" }],
        { ...session, endsAt: "16:00" },
      ).eligible,
    ).toBe(false);
  });
  it("applies across programs and cohorts while respecting the selected period", () => {
    expect(instructorAvailability([preference], session).eligible).toBe(true);
    expect(
      instructorAvailability([preference], {
        ...session,
        startsAt: "13:00",
        endsAt: "16:00",
      }).eligible,
    ).toBe(false);
    expect(
      instructorAvailability([preference], { ...session, endsAt: "16:00" })
        .eligible,
    ).toBe(false);
    expect(
      instructorAvailability([{ ...preference, teachingSlot: "full" }], {
        ...session,
        endsAt: "16:00",
      }).eligible,
    ).toBe(true);
  });
  it("limits weekday availability to the selected day", () => {
    const thursday = {
      ...preference,
      weekday: 4,
      teachingSlot: "weekday" as const,
    };
    expect(
      instructorAvailability([thursday], {
        ...session,
        weekday: 4,
        startsAt: "17:00",
        endsAt: "19:00",
      }).eligible,
    ).toBe(true);
    expect(
      instructorAvailability([thursday], { ...session, weekday: 5 }).eligible,
    ).toBe(false);
    expect(instructorAvailability([], session).eligible).toBe(false);
  });
  it("treats previously program-scoped availability as global", () => {
    expect(
      instructorAvailability(
        [
          {
            ...preference,
            programId: "22222222-2222-4222-8222-222222222222",
            cohort: "session-1",
          },
        ],
        session,
      ).eligible,
    ).toBe(true);
  });
  it("rejects out-of-bounds and reversed teaching ranges", () => {
    for (const invalid of [
      { minimumAge: 1 },
      { maximumAge: 13 },
      { minimumAge: 13 },
      { minimumLevel: 0 },
      { maximumLevel: 7 },
      { minimumAge: 12, maximumAge: 7 },
    ]) {
      expect(
        instructorPreferenceSchema.safeParse({ ...preference, ...invalid })
          .success,
      ).toBe(false);
    }
  });
});
