import { expect, it } from "vitest";
import { placementReviewIssues } from "./placement-review";

it("detects all incompatible current values without changing the placement", () => {
  const student = {
    registrationStatus: "active",
    disciplineId: "ski",
    abilityLevelId: "level3",
    dateOfBirth: "2017-02-01",
    schedule: { weekday: 6, timeSlotId: "morning" },
  };
  const group = {
    disciplineId: "ski",
    abilityLevelId: "level3",
    ageBandId: "kids",
    weekday: 6,
    timeSlotId: "morning",
  };
  const bands = [{ id: "kids", minimumAge: 7, maximumAge: 12 }];
  expect(placementReviewIssues(student, group, bands, "2027-01-01")).toEqual(
    [],
  );
  expect(
    placementReviewIssues(
      {
        ...student,
        registrationStatus: "cancelled",
        disciplineId: "snowboard",
        abilityLevelId: "level4",
        dateOfBirth: "2022-02-01",
        schedule: { weekday: 0, timeSlotId: "morning" },
      },
      group,
      bands,
      "2027-01-01",
    ),
  ).toEqual([
    "Registration is no longer active",
    "Discipline differs from group",
    "Level differs from group",
    "Session differs from group",
    "Age is outside the group’s age band",
  ]);
  expect(student.abilityLevelId).toBe("level3");
});
