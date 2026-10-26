import { expect, test } from "vitest";
import { staffingGuidance } from "./staffing-ratio";

test("counts lead and assistant instructors once and warns only above 4:1", () => {
  expect(staffingGuidance(4, ["lead"], "lead").message).toBeNull();
  expect(staffingGuidance(5, ["lead"], "lead").aboveRatio).toBe(true);
  expect(staffingGuidance(8, ["lead", "assistant"], "lead").message).toBeNull();
  expect(
    staffingGuidance(9, ["lead", "assistant"], "lead").recommendedInstructors,
  ).toBe(3);
  expect(staffingGuidance(7, []).message).toContain(
    "2 instructors recommended",
  );
  expect(staffingGuidance(0, []).message).toBeNull();
});
