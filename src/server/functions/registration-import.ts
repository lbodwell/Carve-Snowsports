import { createServerFn } from "@tanstack/react-start";
import { start } from "workflow/api";
import { z } from "zod";
import type { Actor } from "@/application/policies/authorization";

import {
  applyRegistrationImportSchema,
  getRegistrationImportHistory,
  getRegistrationImportPreview as getRegistrationImportPreviewInService,
  getRegistrationImportWorkspace as getRegistrationImportWorkspaceInService,
  importIdentityDecisionSchema,
  previewRegistrationImport as previewRegistrationImportInService,
  previewRegistrationImportSchema,
  queueRegistrationImport as queueRegistrationImportInService,
  queueRegistrationImportZip as queueRegistrationImportZipInService,
  queueRegistrationZipSchema,
  recordImportDispatchFailure,
  recordImportWorkflowRun,
  requestRegistrationImportApply,
  retryRegistrationImport,
  saveImportIdentityDecision,
} from "@/application/services/registration-import-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";
import { ApplicationError } from "@/application/errors";
import {
  prepareImportUpload,
  prepareImportUploadSchema,
  queueStoredImport,
  storedImportUploadSchema,
} from "@/application/services/import-upload-service.server";
import {
  applyAspenwareImport,
  processAspenwareImport,
} from "@/workflows/aspenware-import";

async function dispatchReconciliation(actor: Actor, batchId: string) {
  const run = await start(processAspenwareImport, [batchId]).catch(async () => {
    await recordImportDispatchFailure(actor, batchId, "reconcile");
    throw new ApplicationError(
      "INVALID_STATE",
      "Import processing could not start. Refresh the batch and retry processing.",
    );
  });
  await recordImportWorkflowRun(actor, batchId, run.runId);
}

export const retryFailedRegistrationImport = createServerFn({ method: "POST" })
  .validator(applyRegistrationImportSchema)
  .handler(async ({ data }) => {
    const actor = await resolveActor();
    const queued = await retryRegistrationImport(actor, data);
    await dispatchReconciliation(actor, queued.batchId);
    return queued;
  });

export const prepareRegistrationImportUpload = createServerFn({
  method: "POST",
})
  .validator(prepareImportUploadSchema)
  .handler(async ({ data }) => prepareImportUpload(await resolveActor(), data));
export const queueUploadedRegistrationImport = createServerFn({
  method: "POST",
})
  .validator(storedImportUploadSchema)
  .handler(async ({ data }) => {
    const actor = await resolveActor();
    const queued = await queueStoredImport(actor, data);
    if (queued.status === "queued")
      await dispatchReconciliation(actor, queued.batchId);
    return queued;
  });

export const getRecentRegistrationImports = createServerFn({ method: "GET" })
  .validator(z.object({ programId: z.uuid() }))
  .handler(async ({ data }) =>
    getRegistrationImportHistory(await resolveActor(), data.programId),
  );

export const reviewImportIdentity = createServerFn({ method: "POST" })
  .validator(importIdentityDecisionSchema)
  .handler(async ({ data }) =>
    saveImportIdentityDecision(await resolveActor(), data),
  );

export const previewRegistrationImport = createServerFn({ method: "POST" })
  .validator(previewRegistrationImportSchema)
  .handler(async ({ data }) =>
    previewRegistrationImportInService(await resolveActor(), data),
  );

export const getRegistrationImport = createServerFn({ method: "GET" })
  .validator(applyRegistrationImportSchema)
  .handler(async ({ data }) =>
    getRegistrationImportPreviewInService(await resolveActor(), data.batchId),
  );

export const getRegistrationImportWorkspace = createServerFn({
  method: "GET",
}).handler(async () =>
  getRegistrationImportWorkspaceInService(await resolveActor()),
);

export const queueRegistrationImport = createServerFn({ method: "POST" })
  .validator(previewRegistrationImportSchema)
  .handler(async ({ data }) => {
    const actor = await resolveActor();
    const queued = await queueRegistrationImportInService(actor, data);
    if (queued.status === "queued")
      await dispatchReconciliation(actor, queued.batchId);
    return queued;
  });

export const queueRegistrationImportZip = createServerFn({ method: "POST" })
  .validator(queueRegistrationZipSchema)
  .handler(async ({ data }) => {
    const actor = await resolveActor();
    const queued = await queueRegistrationImportZipInService(actor, data);
    if (queued.status === "queued")
      await dispatchReconciliation(actor, queued.batchId);
    return queued;
  });

export const applyRegistrationImport = createServerFn({ method: "POST" })
  .validator(applyRegistrationImportSchema)
  .handler(async ({ data }) => {
    const actor = await resolveActor();
    const queued = await requestRegistrationImportApply(actor, data);
    if (queued.start) {
      const run = await start(applyAspenwareImport, [
        queued.batchId,
        actor.organizationId,
        actor.userId,
      ]).catch(async () => {
        await recordImportDispatchFailure(actor, queued.batchId, "apply");
        throw new ApplicationError(
          "INVALID_STATE",
          "Import application could not start. Refresh the batch and try Apply again.",
        );
      });
      await recordImportWorkflowRun(actor, queued.batchId, run.runId);
    }
    return { batchId: queued.batchId };
  });
