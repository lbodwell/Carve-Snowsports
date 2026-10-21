import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { requirePermission } from "@/application/policies/authorization";
import { archiveStudent } from "@/application/services/student-roster-service.server";
import { saveInstructor } from "@/application/services/instructor-service.server";
import {
  createGroupingDraft,
  returnGroupingDraft,
  setRegistrationSchedule,
  suggestRemainingPlacements,
} from "@/application/services/grouping-draft-service.server";
import { createSeason } from "@/application/services/season-service.server";
import {
  confirmSurveyMatch,
  refreshSurveyMatches,
} from "@/application/services/survey-matching-service.server";
import {
  applyRegistrationImport,
  recordImportDispatchFailure,
  requestRegistrationImportApply,
  saveImportIdentityDecision,
} from "@/application/services/registration-import-service.server";
import {
  prepareImportUpload,
  queueStoredImport,
} from "@/application/services/import-upload-service.server";
import {
  adminActor,
  coordinatorActor,
  instructorActor,
} from "@/test/factories/actors";

describe("authorized write boundaries", () => {
  it("protects matching, imports, upload tokens, and grouping review before any database work", async () => {
    const id = randomUUID();
    const actions = [
      () =>
        confirmSurveyMatch(instructorActor, {
          responseId: id,
          studentId: id,
          fillMissingBirthDate: false,
        }),
      () => refreshSurveyMatches(instructorActor),
      () => applyRegistrationImport(instructorActor, { batchId: id }),
      () => requestRegistrationImportApply(instructorActor, { batchId: id }),
      () => recordImportDispatchFailure(instructorActor, id, "apply"),
      () =>
        saveImportIdentityDecision(instructorActor, {
          batchId: id,
          participantKey: "synthetic",
          studentId: "new",
        }),
      () =>
        prepareImportUpload(instructorActor, {
          programId: id,
          name: "listing.csv",
          size: 100,
        }),
      () => queueStoredImport(instructorActor, { programId: id, files: [] }),
      () =>
        setRegistrationSchedule(instructorActor, {
          registrationId: id,
          weekday: 6,
          timeSlotId: id,
        }),
      () =>
        suggestRemainingPlacements(instructorActor, {
          draftId: id,
          baseVersion: 1,
          weekday: 6,
          timeSlotId: id,
        }),
      () =>
        returnGroupingDraft(coordinatorActor, { draftId: id, baseVersion: 1 }),
    ];
    for (const action of actions)
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
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
