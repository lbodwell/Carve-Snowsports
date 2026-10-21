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
  it("keeps different abilities together with peers when staff are available", () => {
    const input = [
      registration("advanced", { abilityRank: 6 }),
      registration("beginner", { abilityRank: 1 }),
    ];
    const staff = [
      { ...instructors[0]!, capacity: 1 },
      { ...instructors[0]!, id: "second-instructor", capacity: 1 },
    ];
    const rules = {
      maximumStudentsPerGroup: 6,
      targetStudentsPerGroup: 4,
      minimumInstructorsPerGroup: 1,
    };
    const result = generateGroupingDraft(input, staff, rules);
    expect(result.groups).toHaveLength(2);
    expect(result).toEqual(
      generateGroupingDraft([...input].reverse(), [...staff].reverse(), rules),
    );
    expect(new Set(result.groups.map((group) => group.instructorId)).size).toBe(
      2,
    );
  });
  it("uses the target size without inventing extra simultaneous instructors", () => {
    const input = Array.from({ length: 8 }, (_, index) =>
      registration(`student-${index}`),
    );
    const staff = [
      { ...instructors[0]!, capacity: 1 },
      { ...instructors[0]!, id: "second-instructor", capacity: 1 },
    ];
    const result = generateGroupingDraft(input, staff, {
      maximumStudentsPerGroup: 6,
      targetStudentsPerGroup: 4,
      minimumInstructorsPerGroup: 1,
    });
    expect(
      result.groups.map((group) => group.registrationIds.length).sort(),
    ).toEqual([4, 4]);
    expect(result.unplaced).toEqual([]);
  });
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
