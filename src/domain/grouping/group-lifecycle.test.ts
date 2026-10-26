import { describe, expect, test } from "vitest";
import {
  applyGroupChange,
  groupsAsOf,
  lifecycleBoundaries,
} from "./group-lifecycle";
import type { LifecycleGroup } from "./group-lifecycle";

const base: Array<LifecycleGroup> = [
  {
    id: "a",
    disciplineId: "ski",
    ageBandId: "children",
    abilityLevelId: "one",
    weekday: 6,
    timeSlotId: "am",
    leadInstructorId: null,
    instructorIds: [],
    notes: "Original notes",
    registrationIds: ["student", "peer"],
    displayOrdinal: 1,
  },
  {
    id: "b",
    disciplineId: "ski",
    ageBandId: "children",
    abilityLevelId: "two",
    weekday: 6,
    timeSlotId: "am",
    leadInstructorId: null,
    instructorIds: [],
    notes: null,
    registrationIds: [],
    displayOrdinal: 2,
  },
];
describe("effective dated placement history", () => {
  test("closure requires an empty group and reopening preserves its identity", () => {
    expect(() =>
      applyGroupChange(base, { type: "closure", groupId: "a", closed: true }),
    ).toThrow("Move all students");
    const closed = applyGroupChange(base, {
      type: "closure",
      groupId: "b",
      closed: true,
    });
    expect(closed[1]).toMatchObject({
      id: "b",
      closed: true,
      instructorIds: [],
      leadInstructorId: null,
    });
    const reopened = applyGroupChange(closed, {
      type: "closure",
      groupId: "b",
      closed: false,
    });
    expect(reopened[1]).toMatchObject({
      id: "b",
      closed: false,
      displayOrdinal: 2,
    });
    expect(base[1]!.closed).toBeUndefined();
  });
  test("a one-lesson exception returns to the underlying placement without modifying history", () => {
    const changes = [
      {
        id: "exception",
        effectiveFrom: "2030-01-12",
        effectiveUntil: "2030-01-12",
        action: {
          type: "move" as const,
          fromGroupId: "a",
          toGroupId: "b",
          registrationId: "student",
        },
      },
    ];
    expect(
      groupsAsOf(base, changes, "2030-01-11")[0]!.registrationIds,
    ).toContain("student");
    expect(groupsAsOf(base, changes, "2030-01-12")[1]!.registrationIds).toEqual(
      ["student"],
    );
    expect(
      groupsAsOf(base, changes, "2030-01-13")[0]!.registrationIds,
    ).toContain("student");
    expect(base[0]!.registrationIds).toEqual(["student", "peer"]);
    expect(lifecycleBoundaries(changes, "2030-01-01", "2030-02-01")).toEqual([
      "2030-01-01",
      "2030-01-12",
      "2030-01-13",
    ]);
  });
  test("splits preserve lineage and source notes without copying staffing", () => {
    const result = applyGroupChange(base, {
      type: "split",
      groupId: "a",
      newGroupId: "c",
      registrationIds: ["student"],
    });
    expect(result[2]).toMatchObject({
      parentGroupId: "a",
      notes: null,
      leadInstructorId: null,
      instructorIds: [],
      displayOrdinal: 3,
    });
    expect(result[0]!.notes).toBe("Original notes");
  });
  test("rejects stale source placements and duplicate split identities", () => {
    expect(() =>
      applyGroupChange(base, {
        type: "move",
        fromGroupId: "b",
        toGroupId: "a",
        registrationId: "student",
      }),
    ).toThrow("source placement changed");
    expect(() =>
      applyGroupChange(base, {
        type: "split",
        groupId: "a",
        newGroupId: "b",
        registrationIds: ["student"],
      }),
    ).toThrow();
  });
});
