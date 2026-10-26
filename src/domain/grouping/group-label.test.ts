import { expect, it } from "vitest";
import { descriptiveGroupLabel, groupSuffix } from "./group-label";

it("uses characteristics, instructor differentiation, and stable suffix fallback", () => {
  const group = {
    discipline: "Ski",
    ageBand: "Ages 7–12",
    level: "Level 3",
    ordinal: 27,
  };
  expect(descriptiveGroupLabel(group)).toBe("Ski · Ages 7–12 · Level 3");
  expect(descriptiveGroupLabel({ ...group, duplicate: true })).toBe(
    "Ski · Ages 7–12 · Level 3 · AA",
  );
  expect(
    descriptiveGroupLabel({
      ...group,
      duplicate: true,
      instructor: "Alex Example",
    }),
  ).toContain("Alex Example");
  expect(groupSuffix(26)).toBe("Z");
});
