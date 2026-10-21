import { FatalError } from "workflow";
import { and, eq } from "drizzle-orm";
import type { Role } from "@/application/policies/authorization";
import {
  applyRegistrationImport,
  processQueuedRegistrationImport,
} from "@/application/services/registration-import-service.server";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import { importBatches, organizationMemberships } from "@/db/schema";

/**
 * Durable Vercel Workflow entry point. Its input deliberately contains only a
 * batch ID: raw source data remains in private import storage.
 */
export async function processAspenwareImport(batchId: string) {
  "use workflow";
  return reconcileImport(batchId);
}

async function reconcileImport(batchId: string) {
  "use step";
  try {
    return await processQueuedRegistrationImport(batchId);
  } catch {
    throw new FatalError(
      "Import reconciliation failed. Review the source files and retry.",
    );
  }
}

/** The authorized Apply action starts durable execution with identifiers only. */
export async function applyAspenwareImport(
  batchId: string,
  organizationId: string,
  userId: string,
) {
  "use workflow";
  return applyApprovedImport(batchId, organizationId, userId);
}

async function applyApprovedImport(
  batchId: string,
  organizationId: string,
  userId: string,
) {
  "use step";
  try {
    const [membership] = await db
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId),
        ),
      );
    if (!membership) throw new Error("Membership revoked.");
    const actor = { organizationId, userId, role: membership.role as Role };
    requirePermission(actor, "import:manage");
    await applyRegistrationImport(actor, { batchId });
    return { batchId, status: "applied" };
  } catch {
    await db
      .update(importBatches)
      .set({
        status: "ready_for_review",
        failureCode: "APPLY_FAILED",
        workflowPhase: "apply_failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(importBatches.id, batchId),
          eq(importBatches.organizationId, organizationId),
          eq(importBatches.status, "applying"),
        ),
      );
    throw new FatalError(
      "Import apply failed. The roster transaction was rolled back. Review the batch before retrying.",
    );
  }
}
