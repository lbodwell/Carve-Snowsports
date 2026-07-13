import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { requirePermission } from "@/application/policies/authorization";
import { archiveStudent } from "@/application/services/student-roster-service.server";
import { saveInstructor } from "@/application/services/instructor-service.server";
import { createGroupingDraft } from "@/application/services/grouping-draft-service.server";
import { createSeason } from "@/application/services/season-service.server";
import {
  adminActor,
  coordinatorActor,
  instructorActor,
} from "@/test/factories/actors";

describe("authorized write boundaries", () => {
  it("rejects instructors from student roster writes", async () => {
    await expect(
      archiveStudent(instructorActor, { studentId: randomUUID() }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects instructors from instructor roster writes", async () => {
    await expect(
      saveInstructor(instructorActor, {
        firstName: "Alex",
        lastName: "Rivera",
        phone: "555-0100",
        email: "",
        notes: "",
        disciplineKeys: ["ski"],
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects instructors from grouping draft creation", async () => {
    await expect(
      createGroupingDraft(instructorActor, {
        programId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects instructors from season creation", async () => {
    await expect(
      createSeason(instructorActor, {
        name: "Winter 2027",
        startsOn: "2027-01-01",
        endsOn: "2027-03-31",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows coordinators to manage people", () => {
    expect(() =>
      requirePermission(coordinatorActor, "people:manage"),
    ).not.toThrow();
  });

  it("allows admins to manage people", () => {
    expect(() => requirePermission(adminActor, "people:manage")).not.toThrow();
  });
});
