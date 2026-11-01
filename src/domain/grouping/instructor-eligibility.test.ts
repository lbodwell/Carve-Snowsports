import { describe, expect, it } from "vitest";
import { groupInstructorEligibility } from "./instructor-eligibility";

const slot = {
  id: "am",
  cohort: "season",
  startsAt: "10:00",
  endsAt: "12:00",
  allowedWeekdays: [6],
};
const group = {
  id: "group",
  weekday: 6,
  timeSlotId: "am",
  disciplineId: "ski",
  instructorIds: [] as Array<string>,
};
const base = {
  id: "instructor",
  disciplineIds: ["ski"],
  preferences: [
    {
      weekday: 6,
      teachingSlot: "am" as const,
      startsAt: "00:00",
      endsAt: "23:59",
      minimumAge: null as number | null,
      maximumAge: null as number | null,
      minimumLevel: null as number | null,
      maximumLevel: null as number | null,
    },
  ],
};
describe("instructor assignment eligibility", () => {
  it("allows Any and nonmatching age/level preferences, ranking explicit matches higher", () => {
    const mismatched = {
      ...base,
      preferences: [
        {
          ...base.preferences[0]!,
          minimumAge: 2,
          maximumAge: 5,
          minimumLevel: 1,
          maximumLevel: 2,
        },
      ],
    };
    const matched = {
      ...base,
      preferences: [
        {
          ...base.preferences[0]!,
          minimumAge: 11,
          maximumAge: 13,
          minimumLevel: 5,
          maximumLevel: 6,
        },
      ],
    };
    const evaluate = (instructor: typeof base) =>
      groupInstructorEligibility(
        instructor,
        group,
        [group],
        [slot],
        "program",
        { minimumAge: 11, maximumAge: 13 },
        5,
      );
    expect(evaluate(base).eligible).toBe(true);
    expect(evaluate(mismatched)).toMatchObject({ eligible: true, score: 0 });
    expect(evaluate(matched)).toMatchObject({ eligible: true, score: 2 });
  });
  it("blocks missing availability, wrong disciplines and overlapping assignments, while allowing the current group", () => {
    const evaluate = (instructor: typeof base, groups = [group]) =>
      groupInstructorEligibility(
        instructor,
        group,
        groups,
        [slot, { ...slot, id: "full", endsAt: "15:00" }],
        "program",
      );
    expect(evaluate({ ...base, preferences: [] }).eligible).toBe(false);
    expect(evaluate({ ...base, disciplineIds: ["snowboard"] }).eligible).toBe(
      false,
    );
    expect(
      evaluate(base, [
        { ...group, id: "other", timeSlotId: "full", instructorIds: [base.id] },
      ]).eligible,
    ).toBe(false);
    expect(
      evaluate(base, [{ ...group, instructorIds: [base.id] }]).eligible,
    ).toBe(true);
  });
});
