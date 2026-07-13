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
  moveRegistration as moveRegistrationInService,
  moveRegistrationSchema,
  publishGroupingDraft as publishGroupingDraftInService,
  publishGroupingDraftSchema,
  submitGroupingDraft as submitGroupingDraftInService,
  submitGroupingDraftSchema,
  undoDraftOperation as undoDraftOperationInService,
  undoDraftOperationSchema,
  updateDraftGroup as updateDraftGroupInService,
  updateDraftGroupSchema,
} from "@/application/services/grouping-draft-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const getGroupingWorkspace = createServerFn({ method: "GET" }).handler(
  async () => getGroupingWorkspaceInService(await resolveActor()),
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
