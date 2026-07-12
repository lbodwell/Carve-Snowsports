import { describe, expect, it } from "vitest";

import type { Actor } from "@/application/policies/authorization";
import { requirePermission } from "@/application/policies/authorization";

const instructor: Actor = {
  userId: "user-1",
  organizationId: "organization-1",
  role: "instructor",
};

describe("requirePermission", () => {
  it("allows an instructor to operate an assigned lesson", () => {
    expect(() => requirePermission(instructor, "lesson:operate")).not.toThrow();
  });

  it("rejects instructor access to grouping approval", () => {
    expect(() => requirePermission(instructor, "grouping:approve")).toThrow(
      "do not have permission",
    );
  });
});
