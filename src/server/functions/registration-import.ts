import { createServerFn } from "@tanstack/react-start";
import { start } from "workflow/api";

import {
  applyRegistrationImport as applyRegistrationImportInService,
  applyRegistrationImportSchema,
  getRegistrationImportPreview as getRegistrationImportPreviewInService,
  getRegistrationImportWorkspace as getRegistrationImportWorkspaceInService,
  previewRegistrationImport as previewRegistrationImportInService,
  previewRegistrationImportSchema,
  queueRegistrationImport as queueRegistrationImportInService,
  queueRegistrationImportZip as queueRegistrationImportZipInService,
  queueRegistrationZipSchema,
} from "@/application/services/registration-import-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";
import { processAspenwareImport } from "@/workflows/aspenware-import";

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
}).handler(async () => getRegistrationImportWorkspaceInService(await resolveActor()));

export const queueRegistrationImport = createServerFn({ method: "POST" })
  .validator(previewRegistrationImportSchema)
  .handler(async ({ data }) => {
    const queued = await queueRegistrationImportInService(
      await resolveActor(),
      data,
    );
    await start(processAspenwareImport, [queued.batchId]);
    return queued;
  });

export const queueRegistrationImportZip = createServerFn({ method: "POST" })
  .validator(queueRegistrationZipSchema)
  .handler(async ({ data }) => {
    const queued = await queueRegistrationImportZipInService(
      await resolveActor(),
      data,
    );
    await start(processAspenwareImport, [queued.batchId]);
    return queued;
  });

export const applyRegistrationImport = createServerFn({ method: "POST" })
  .validator(applyRegistrationImportSchema)
  .handler(async ({ data }) =>
    applyRegistrationImportInService(await resolveActor(), data),
  );
