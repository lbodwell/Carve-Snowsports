import { createServerFn } from "@tanstack/react-start";

import {
  approveGroupingDraft as approveGroupingDraftInService,
  approveGroupingDraftSchema,
  assignDraftInstructor as assignDraftInstructorInService,
  assignDraftInstructorSchema,
  createDraftGroup as createDraftGroupInService,
  createDraftGroupSchema,
  createGroupingDraft as createGroupingDraftInService,
  createGroupingDraftSchema,
  deleteDraftGroup as deleteDraftGroupInService,
  deleteDraftGroupSchema,
  getGroupingWorkspace as getGroupingWorkspaceInService,
  groupingWorkspaceSchema,
  moveRegistration as moveRegistrationInService,
  moveRegistrationSchema,
  publishGroupingDraft as publishGroupingDraftInService,
  publishGroupingDraftSchema,
  registrationScheduleSchema,
  returnGroupingDraft as returnGroupingDraftInService,
  setRegistrationSchedule,
  submitGroupingDraft as submitGroupingDraftInService,
  submitGroupingDraftSchema,
  suggestRemainingPlacements,
  suggestRemainingSchema,
  undoDraftOperation as undoDraftOperationInService,
  undoDraftOperationSchema,
  updateDraftGroup as updateDraftGroupInService,
  updateDraftGroupSchema,
} from "@/application/services/grouping-draft-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const suggestRemainingDraftPlacements = createServerFn({
  method: "POST",
})
  .validator(suggestRemainingSchema)
  .handler(async ({ data }) =>
    suggestRemainingPlacements(await resolveActor(), data),
  );

export const getGroupingWorkspace = createServerFn({ method: "GET" })
  .validator(groupingWorkspaceSchema)
  .handler(async ({ data }) =>
    getGroupingWorkspaceInService(await resolveActor(), data),
  );

export const saveRegistrationSchedule = createServerFn({ method: "POST" })
  .validator(registrationScheduleSchema)
  .handler(async ({ data }) =>
    setRegistrationSchedule(await resolveActor(), data),
  );
export const returnGroupingDraft = createServerFn({ method: "POST" })
  .validator(submitGroupingDraftSchema)
  .handler(async ({ data }) =>
    returnGroupingDraftInService(await resolveActor(), data),
  );

export const createGroupingDraft = createServerFn({ method: "POST" })
  .validator(createGroupingDraftSchema)
  .handler(async ({ data }) =>
    createGroupingDraftInService(await resolveActor(), data),
  );

export const createDraftGroup = createServerFn({ method: "POST" })
  .validator(createDraftGroupSchema)
  .handler(async ({ data }) =>
    createDraftGroupInService(await resolveActor(), data),
  );

export const moveRegistration = createServerFn({ method: "POST" })
  .validator(moveRegistrationSchema)
  .handler(async ({ data }) =>
    moveRegistrationInService(await resolveActor(), data),
  );

export const assignDraftInstructor = createServerFn({ method: "POST" })
  .validator(assignDraftInstructorSchema)
  .handler(async ({ data }) =>
    assignDraftInstructorInService(await resolveActor(), data),
  );

export const updateDraftGroup = createServerFn({ method: "POST" })
  .validator(updateDraftGroupSchema)
  .handler(async ({ data }) =>
    updateDraftGroupInService(await resolveActor(), data),
  );

export const deleteDraftGroup = createServerFn({ method: "POST" })
  .validator(deleteDraftGroupSchema)
  .handler(async ({ data }) =>
    deleteDraftGroupInService(await resolveActor(), data),
  );

export const undoDraftOperation = createServerFn({ method: "POST" })
  .validator(undoDraftOperationSchema)
  .handler(async ({ data }) =>
    undoDraftOperationInService(await resolveActor(), data),
  );

export const submitGroupingDraft = createServerFn({ method: "POST" })
  .validator(submitGroupingDraftSchema)
  .handler(async ({ data }) =>
    submitGroupingDraftInService(await resolveActor(), data),
  );

export const approveGroupingDraft = createServerFn({ method: "POST" })
  .validator(approveGroupingDraftSchema)
  .handler(async ({ data }) =>
    approveGroupingDraftInService(await resolveActor(), data),
  );

export const publishGroupingDraft = createServerFn({ method: "POST" })
  .validator(publishGroupingDraftSchema)
  .handler(async ({ data }) =>
    publishGroupingDraftInService(await resolveActor(), data),
  );
