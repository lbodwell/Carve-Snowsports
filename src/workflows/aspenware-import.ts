import { processQueuedRegistrationImport } from "@/application/services/registration-import-service.server";

/**
 * Durable Vercel Workflow entry point. Its input deliberately contains only a
 * batch ID: raw source data remains in private import storage.
 */
export async function processAspenwareImport(batchId: string) {
  "use workflow";
  return processQueuedRegistrationImport(batchId);
}
