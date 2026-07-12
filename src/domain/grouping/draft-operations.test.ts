import { describe, expect, it } from "vitest";

import { applyMoveRegistration } from "@/domain/grouping/draft-operations";

describe("applyMoveRegistration", () => {
  it("increments the version and creates an undo command", () => {
    const result = applyMoveRegistration(
      {
        id: "draft-1",
        version: 3,
        assignments: [{ registrationId: "registration-1", groupId: "group-1" }],
      },
      {
        type: "move_registration",
        commandId: crypto.randomUUID(),
        baseVersion: 3,
        registrationId: "registration-1",
        groupId: "group-2",
        overrideReason: "Sibling request",
      },
    );

    expect(result.state.version).toBe(4);
    expect(result.state.assignments).toEqual([
      {
        registrationId: "registration-1",
        groupId: "group-2",
        overrideReason: "Sibling request",
      },
    ]);
    expect(result.inverse).toMatchObject({
      baseVersion: 4,
      groupId: "group-1",
    });
  });

  it("rejects stale commands rather than overwriting newer work", () => {
    expect(() =>
      applyMoveRegistration(
        { id: "draft-1", version: 4, assignments: [] },
        {
          type: "move_registration",
          commandId: crypto.randomUUID(),
          baseVersion: 3,
          registrationId: "registration-1",
          groupId: "group-1",
        },
      ),
    ).toThrow("VERSION_CONFLICT:4");
  });
});
