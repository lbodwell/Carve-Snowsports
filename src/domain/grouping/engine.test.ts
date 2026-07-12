import { describe, expect, it } from "vitest";

import type {
  GroupingInstructor,
  GroupingRegistration,
} from "@/domain/grouping/engine";
import { generateGroupingDraft } from "@/domain/grouping/engine";

const instructors: Array<GroupingInstructor> = [
  {
    id: "ins-ski",
    disciplines: new Set(["ski"]),
    available: true,
    capacity: 2,
  },
];

function registration(
  id: string,
  overrides: Partial<GroupingRegistration> = {},
): GroupingRegistration {
  return {
    id,
    abilityRank: 2,
    ageBand: "7-12",
    discipline: "ski",
    available: true,
    mustSeparateFrom: new Set(),
    preferTogetherWith: new Set(),
    ...overrides,
  };
}

describe("generateGroupingDraft", () => {
  it("is deterministic and never exceeds capacity", () => {
    const input = [registration("student-a"), registration("student-b")];
    const rules = {
      maximumStudentsPerGroup: 2,
      targetStudentsPerGroup: 2,
      minimumInstructorsPerGroup: 1,
    };

    const first = generateGroupingDraft(input, instructors, rules);
    const second = generateGroupingDraft(input, instructors, rules);

    expect(first).toEqual(second);
    expect(first.unplaced).toEqual([]);
    expect(first.groups).toHaveLength(1);
    expect(first.groups[0]?.registrationIds).toEqual([
      "student-a",
      "student-b",
    ]);
  });

  it("explains unplaced unavailable students", () => {
    const result = generateGroupingDraft(
      [registration("student-a", { available: false })],
      instructors,
      {
        maximumStudentsPerGroup: 2,
        targetStudentsPerGroup: 2,
        minimumInstructorsPerGroup: 1,
      },
    );

    expect(result.unplaced[0]).toMatchObject({
      registrationId: "student-a",
      reason: expect.stringContaining("unavailable"),
    });
  });

  it("does not place configured separation pairs together", () => {
    const result = generateGroupingDraft(
      [
        registration("student-a", { mustSeparateFrom: new Set(["student-b"]) }),
        registration("student-b"),
      ],
      instructors,
      {
        maximumStudentsPerGroup: 3,
        targetStudentsPerGroup: 2,
        minimumInstructorsPerGroup: 1,
      },
    );

    expect(
      result.groups.every((group) => group.registrationIds.length === 1),
    ).toBe(true);
  });
});
