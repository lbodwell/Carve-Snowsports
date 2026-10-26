import { createHash, randomUUID } from "node:crypto";

import AdmZip from "adm-zip";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import type {
  AspenwareImportFact,
  CsvRecord,
} from "@/domain/imports/aspenware-registration";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import {
  getImportObject,
  putImportObject,
} from "@/application/ports/import-storage.server";
import { db } from "@/db/client.server";
import {
  abilityLevels,
  auditEvents,
  contactMethods,
  disciplines,
  externalIdentities,
  importBatches,
  importFiles,
  importRows,
  organizations,
  people,
  programs,
  registrationParties,
  registrationSources,
  registrations,
  seasons,
  students,
} from "@/db/schema";
import {
  ASPENWARE_ADAPTER_VERSION,
  previewAspenwareRegistrationBatch,
} from "@/domain/imports/aspenware-registration";
import { validateAspenwareImportFiles } from "@/domain/imports/aspenware-upload";
import { reconcileSurveyMatches } from "@/application/services/survey-matching-service.server";
import { possibleImportedStudents } from "@/domain/imports/person-review";

const adapter = "aspenware-registration";
const sourceSystem = "aspenware";

const optionalCsv = z.string().min(1).optional();
export const previewRegistrationImportSchema = z.object({
  programId: z.uuid(),
  listingCsv: z.string().min(1),
  listingName: z.string().trim().min(1).max(255),
  byOrderCsv: optionalCsv,
  byOrderName: z.string().trim().min(1).max(255).optional(),
  birthdateCsv: optionalCsv,
  birthdateName: z.string().trim().min(1).max(255).optional(),
  promptCsv: optionalCsv,
  promptName: z.string().trim().min(1).max(255).optional(),
});
export const applyRegistrationImportSchema = z.object({ batchId: z.uuid() });
export const importIdentityDecisionSchema = z.object({
  batchId: z.uuid(),
  participantKey: z.string().min(1),
  studentId: z.union([z.uuid(), z.literal("new")]),
});
export const queueRegistrationZipSchema = z.object({
  programId: z.uuid(),
  archiveName: z.string().trim().endsWith(".zip"),
  archiveBase64: z
    .string()
    .min(1)
    .max(20 * 1024 * 1024),
});

type PreviewInput = z.infer<typeof previewRegistrationImportSchema>;
type StoredFact = AspenwareImportFact;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function csvRecords(content: string, source: string): Array<CsvRecord> {
  try {
    return parse(content, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: false,
    });
  } catch (error) {
    throw new ApplicationError(
      "VALIDATION",
      `${source} CSV could not be parsed: ${error instanceof Error ? error.message : "invalid CSV"}`,
    );
  }
}

function remapListing(row: CsvRecord): CsvRecord {
  return {
    DetailRowC0: row.DetailRowC0 ?? "",
    CustomerName: row.CustomerName ?? "",
    textbox10: row.textbox10 ?? "",
    DetailRowC1: row.DetailRowC1 ?? "",
    "Product Date": row.DetailRowC2 ?? "",
    Qty: row.DetailRowC3 ?? "",
    Product: row.DetailRowC4 ?? "",
    "Net Amount": row.DetailRowC5 ?? "",
    "Transaction Type / Reservation Status": row.DetailRowC6 ?? "",
  };
}

function remapPrompt(row: CsvRecord): CsvRecord {
  return {
    ...row,
    TransactionID: row.TransactionID ?? "",
    TransactionLineIPCode: row.TransactionLineIPCode ?? "",
    ProductDate: row.ProductDate ?? "",
    ProductHeaderDescription: row.ProductHeaderDescription ?? "",
    PromptName1: row.PromptName1 ?? "",
    PromptData1: row.PromptData1 ?? "",
    TotalPrice: row.TotalPrice ?? "",
  };
}

function sourceFiles(input: PreviewInput) {
  return [
    { kind: "listing", content: input.listingCsv, name: input.listingName },
    ...(input.byOrderCsv
      ? [
          {
            kind: "by_order",
            content: input.byOrderCsv,
            name: input.byOrderName ?? "by-order.csv",
          },
        ]
      : []),
    ...(input.birthdateCsv
      ? [
          {
            kind: "customer_dob",
            content: input.birthdateCsv,
            name: input.birthdateName ?? "birthdates.csv",
          },
        ]
      : []),
    ...(input.promptCsv
      ? [
          {
            kind: "prompts",
            content: input.promptCsv,
            name: input.promptName ?? "prompts.csv",
          },
        ]
      : []),
  ];
}

async function assertProgram(actor: Actor, programId: string) {
  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(programs.id, programId),
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );
  if (!program) throw new ApplicationError("NOT_FOUND", "Program not found.");
}

async function toPreview(
  batch: typeof importBatches.$inferSelect,
  rows: Array<typeof importRows.$inferSelect>,
) {
  const facts = rows.map((row) => row.normalized as StoredFact);
  const values = batch.reconciliation ?? {};
  const numberValue = (key: string) =>
    typeof values[key] === "number" ? values[key] : 0;
  const candidates = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      dateOfBirth: people.dateOfBirth,
    })
    .from(students)
    .innerJoin(people, eq(people.id, students.personId))
    .where(
      and(
        eq(people.organizationId, batch.organizationId),
        isNull(people.archivedAt),
      ),
    );
  const identities = await db
    .select({
      externalId: externalIdentities.externalId,
      entityId: externalIdentities.entityId,
    })
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.organizationId, batch.organizationId),
        eq(externalIdentities.sourceSystem, sourceSystem),
        eq(externalIdentities.entityType, "person"),
      ),
    );
  const bound = new Set(identities.map((identity) => identity.externalId));
  const identityReview = [
    ...new Map(
      rows.flatMap((row) => {
        const fact = row.normalized as StoredFact;
        if (fact.status !== "active" || bound.has(fact.participantKey))
          return [];
        const matches = possibleImportedStudents(fact.studentName, candidates);
        return matches.length
          ? [
              [
                fact.participantKey,
                {
                  participantKey: fact.participantKey,
                  studentName: fact.studentName,
                  candidates: matches,
                  decision: row.matchDecision?.studentId as string | undefined,
                },
              ] as const,
            ]
          : [];
      }),
    ).values(),
  ];
  return {
    batchId: batch.id,
    status: batch.status,
    updatedAt: batch.updatedAt.toISOString(),
    failureCode: batch.failureCode,
    issues: Array.isArray(values.issues)
      ? values.issues.filter(
          (issue): issue is string => typeof issue === "string",
        )
      : [],
    identityReview,
    reconciliation: {
      grossSales: numberValue("grossSales"),
      returns: numberValue("returns"),
      active: numberValue("active"),
      returned: numberValue("returned"),
      promptMatched: numberValue("promptMatched"),
      byOrderMatched: numberValue("byOrderMatched"),
      issueCount: numberValue("issueCount"),
    },
    facts: facts.map((fact) => ({
      rowNumber: fact.rowNumber,
      studentName: fact.studentName,
      status: fact.status,
      discipline: fact.dimensions.discipline,
      abilityLevel: fact.abilityLevel,
      issues: [
        ...fact.issues,
        ...(fact.dateOfBirth &&
        (() => {
          const candidate = candidates.find(
            (person) =>
              person.id ===
              identities.find(
                (identity) => identity.externalId === fact.participantKey,
              )?.entityId,
          );
          return (
            candidate?.dateOfBirth && candidate.dateOfBirth !== fact.dateOfBirth
          );
        })()
          ? [
              "Export birthdate differs from the saved profile; existing birthdate will be preserved.",
            ]
          : []),
      ],
    })),
  };
}

export async function previewRegistrationImport(
  actor: Actor,
  input: PreviewInput,
) {
  requirePermission(actor, "import:manage");
  const parsed = previewRegistrationImportSchema.parse(input);
  await assertProgram(actor, parsed.programId);
  const files = sourceFiles(parsed);
  validateAspenwareImportFiles(files);
  const inputSetHash = hash(
    `${parsed.programId}:${ASPENWARE_ADAPTER_VERSION}:` +
      files
        .map((file) => `${file.kind}:${hash(file.content)}`)
        .sort()
        .join("|"),
  );
  const [existing] = await db
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.organizationId, actor.organizationId),
        eq(importBatches.sourceAdapter, adapter),
        eq(importBatches.fileHash, inputSetHash),
      ),
    );
  if (existing) {
    const rows = await db
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, existing.id));
    return toPreview(existing, rows);
  }

  const listingRecords = csvRecords(parsed.listingCsv, "Listing").map(
    remapListing,
  );
  const byOrderRecords = parsed.byOrderCsv
    ? csvRecords(parsed.byOrderCsv, "By-order")
    : undefined;
  const promptRecords = parsed.promptCsv
    ? csvRecords(parsed.promptCsv, "Prompt").map(remapPrompt)
    : undefined;
  const preview = previewAspenwareRegistrationBatch({
    birthdateRecords: parsed.birthdateCsv
      ? csvRecords(parsed.birthdateCsv, "Birthdates")
      : undefined,
    listingRecords,
    byOrderRecords,
    promptRecords,
  });

  const [batch] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(importBatches)
      .values({
        organizationId: actor.organizationId,
        programId: parsed.programId,
        sourceAdapter: adapter,
        adapterVersion: ASPENWARE_ADAPTER_VERSION,
        fileHash: inputSetHash,
        inputSetHash,
        status: preview.issues.length ? "needs_review" : "ready",
        uploadedBy: actor.userId,
        reconciliation: {
          ...preview.summary,
          sourceCounts: preview.sourceCounts,
          issueCount: preview.issues.length,
          issues: preview.issues,
        },
      })
      .returning();
    if (!created)
      throw new ApplicationError(
        "INVALID_STATE",
        "Could not create import batch.",
      );
    await tx.insert(importFiles).values(
      files.map((file) => ({
        batchId: created.id,
        sourceKind: file.kind,
        originalName: file.name,
        rawHash: hash(file.content),
        rowCount: csvRecords(file.content, file.kind).length,
      })),
    );
    await tx.insert(importRows).values(
      preview.facts.map((fact) => ({
        batchId: created.id,
        rowNumber: fact.rowNumber,
        status: fact.status === "returned" ? "returned" : "pending",
        rawHash: hash(fact.sourceKey),
        normalized: fact,
        issues: fact.issues,
      })),
    );
    return [created];
  });
  return toPreview(
    batch,
    await db.select().from(importRows).where(eq(importRows.batchId, batch.id)),
  );
}

export async function queueRegistrationImport(
  actor: Actor,
  input: PreviewInput,
) {
  requirePermission(actor, "import:manage");
  const parsed = previewRegistrationImportSchema.parse(input);
  await assertProgram(actor, parsed.programId);
  const files = validateAspenwareImportFiles(sourceFiles(parsed));
  const inputSetHash = hash(
    `${parsed.programId}:${ASPENWARE_ADAPTER_VERSION}:` +
      files
        .map((file) => `${file.sourceKind}:${hash(file.content)}`)
        .sort()
        .join("|"),
  );
  const [existing] = await db
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.organizationId, actor.organizationId),
        eq(importBatches.sourceAdapter, adapter),
        eq(importBatches.fileHash, inputSetHash),
      ),
    );
  if (existing) return { batchId: existing.id, status: existing.status };

  const [batch] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(importBatches)
      .values({
        organizationId: actor.organizationId,
        programId: parsed.programId,
        sourceAdapter: adapter,
        adapterVersion: ASPENWARE_ADAPTER_VERSION,
        fileHash: inputSetHash,
        inputSetHash,
        status: "queued",
        workflowPhase: "queued",
        uploadedBy: actor.userId,
      })
      .returning({ id: importBatches.id });
    if (!created)
      throw new ApplicationError("INVALID_STATE", "Could not queue import.");
    const stored = await Promise.all(
      files.map(async (file) => ({
        ...file,
        storageKey: await putImportObject(
          `${actor.organizationId}/${created.id}/${file.sourceKind}.csv`,
          file.content,
        ),
      })),
    );
    await tx.insert(importFiles).values(
      stored.map((file) => ({
        batchId: created.id,
        sourceKind: file.sourceKind,
        originalName: file.name,
        rawHash: hash(file.content),
        storageKey: file.storageKey,
        rowCount: file.rowCount,
        status: "validated",
      })),
    );
    return [created];
  });
  return { batchId: batch.id, status: "queued" };
}

export async function queueRegistrationImportZip(
  actor: Actor,
  input: z.infer<typeof queueRegistrationZipSchema>,
) {
  requirePermission(actor, "import:manage");
  const parsed = queueRegistrationZipSchema.parse(input);
  let archive: AdmZip;
  try {
    archive = new AdmZip(Buffer.from(parsed.archiveBase64, "base64"));
  } catch {
    throw new ApplicationError("VALIDATION", "ZIP archive could not be read.");
  }
  const entries = archive.getEntries();
  if (entries.filter((entry) => !entry.isDirectory).length > 4)
    throw new ApplicationError(
      "VALIDATION",
      "The ZIP may contain at most four CSV exports.",
    );
  const files = entries.flatMap((entry) => {
    if (entry.isDirectory) return [];
    if (
      entry.entryName.includes("..") ||
      entry.entryName.startsWith("/") ||
      entry.entryName.includes("\\")
    )
      throw new ApplicationError(
        "VALIDATION",
        "ZIP contains an unsafe file path.",
      );
    if (entry.header.flags & 1)
      throw new ApplicationError(
        "VALIDATION",
        "Encrypted ZIP archives are not supported.",
      );
    if (entry.header.size > 10 * 1024 * 1024)
      throw new ApplicationError(
        "VALIDATION",
        "A file in the ZIP exceeds the 10 MB limit.",
      );
    const data = entry.getData();
    if (data.byteLength > 10 * 1024 * 1024)
      throw new ApplicationError(
        "VALIDATION",
        `${entry.entryName} exceeds the 10 MB limit.`,
      );
    return [{ name: entry.name, content: data.toString("utf8") }];
  });
  const validated = validateAspenwareImportFiles(files);
  const bySource = new Map(validated.map((file) => [file.sourceKind, file]));
  const listing = bySource.get("listing");
  if (!listing)
    throw new ApplicationError(
      "VALIDATION",
      "Customer product listing is required.",
    );
  const byOrder = bySource.get("by_order");
  const prompts = bySource.get("prompts");
  return queueRegistrationImport(actor, {
    programId: parsed.programId,
    listingCsv: listing.content,
    listingName: listing.name,
    byOrderCsv: byOrder?.content,
    byOrderName: byOrder?.name,
    birthdateCsv: bySource.get("customer_dob")?.content,
    birthdateName: bySource.get("customer_dob")?.name,
    promptCsv: prompts?.content,
    promptName: prompts?.name,
  });
}

export async function processQueuedRegistrationImport(batchId: string) {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId));
  if (!batch)
    throw new ApplicationError("NOT_FOUND", "Import batch not found.");
  if (batch.status !== "queued") return { batchId, status: batch.status };
  const claim = `reconciling:${randomUUID()}`;
  const [claimed] = await db
    .update(importBatches)
    .set({
      status: "processing",
      workflowPhase: claim,
      updatedAt: new Date(),
    })
    .where(
      and(eq(importBatches.id, batchId), eq(importBatches.status, "queued")),
    )
    .returning({ id: importBatches.id });
  if (!claimed) return { batchId, status: "processing" };
  try {
    const fileRows = await db
      .select()
      .from(importFiles)
      .where(eq(importFiles.batchId, batchId));
    const contents = await Promise.all(
      fileRows.map(async (file) => {
        if (!file.storageKey)
          throw new Error("Import file has no storage object.");
        return {
          sourceKind: file.sourceKind,
          content: (await getImportObject(file.storageKey)).content,
        };
      }),
    );
    const listing = contents.find((file) => file.sourceKind === "listing");
    if (!listing) throw new Error("Customer product listing is required.");
    const byOrder = contents.find((file) => file.sourceKind === "by_order");
    const prompts = contents.find((file) => file.sourceKind === "prompts");
    const birthdates = contents.find(
      (file) => file.sourceKind === "customer_dob",
    );
    const preview = previewAspenwareRegistrationBatch({
      birthdateRecords: birthdates
        ? csvRecords(birthdates.content, "Birthdates")
        : undefined,
      listingRecords: csvRecords(listing.content, "Listing").map(remapListing),
      byOrderRecords: byOrder
        ? csvRecords(byOrder.content, "By-order")
        : undefined,
      promptRecords: prompts
        ? csvRecords(prompts.content, "Prompt").map(remapPrompt)
        : undefined,
    });
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ phase: importBatches.workflowPhase })
        .from(importBatches)
        .where(eq(importBatches.id, batchId))
        .for("update");
      if (current?.phase !== claim) return;
      await tx.delete(importRows).where(eq(importRows.batchId, batchId));
      await tx.insert(importRows).values(
        preview.facts.map((fact) => ({
          batchId,
          rowNumber: fact.rowNumber,
          status: fact.status === "returned" ? "returned" : "pending",
          rawHash: hash(fact.sourceKey),
          normalized: fact,
          issues: fact.issues,
        })),
      );
      await tx
        .update(importBatches)
        .set({
          status: preview.issues.length ? "needs_review" : "ready_for_review",
          workflowPhase: "reconciled",
          reconciliation: {
            ...preview.summary,
            sourceCounts: preview.sourceCounts,
            issueCount: preview.issues.length,
            issues: preview.issues,
          },
          updatedAt: new Date(),
        })
        .where(eq(importBatches.id, batchId));
    });
    return {
      batchId,
      status: preview.issues.length ? "needs_review" : "ready_for_review",
    };
  } catch (error) {
    await db
      .update(importBatches)
      .set({
        status: "failed",
        workflowPhase: "failed",
        failureCode: "PROCESSING_FAILED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(importBatches.id, batchId),
          eq(importBatches.workflowPhase, claim),
        ),
      );
    throw error;
  }
}

export async function retryRegistrationImport(
  actor: Actor,
  input: { batchId: string },
) {
  requirePermission(actor, "import:manage");
  const parsed = applyRegistrationImportSchema.parse(input);
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, parsed.batchId),
          eq(importBatches.organizationId, actor.organizationId),
        ),
      )
      .for("update");
    if (!batch) throw new ApplicationError("NOT_FOUND", "Import not found.");
    const stalled =
      ["queued", "processing"].includes(batch.status) &&
      Date.now() - batch.updatedAt.getTime() > 10 * 60_000;
    if (batch.status !== "failed" && !stalled)
      throw new ApplicationError(
        "INVALID_STATE",
        "Only failed imports or imports stalled for ten minutes can be retried.",
      );
    await tx
      .update(importBatches)
      .set({
        status: "queued",
        workflowPhase: "queued",
        failureCode: null,
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, batch.id));
    return { batchId: batch.id, status: "queued" };
  });
}

export async function recordImportWorkflowRun(
  actor: Actor,
  batchId: string,
  runId: string,
) {
  requirePermission(actor, "import:manage");
  await db
    .update(importBatches)
    .set({ workflowRunId: runId })
    .where(
      and(
        eq(importBatches.id, batchId),
        eq(importBatches.organizationId, actor.organizationId),
      ),
    );
}

/** A dispatcher failure must leave an immediate, reviewable retry path. */
export async function recordImportDispatchFailure(
  actor: Actor,
  batchId: string,
  phase: "reconcile" | "apply",
) {
  requirePermission(actor, "import:manage");
  await db.transaction(async (tx) => {
    const changed = await tx
      .update(importBatches)
      .set({
        status: phase === "apply" ? "ready_for_review" : "failed",
        failureCode: phase === "apply" ? "APPLY_FAILED" : "PROCESSING_FAILED",
        workflowPhase: "dispatch_failed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(importBatches.id, batchId),
          eq(importBatches.organizationId, actor.organizationId),
          eq(importBatches.status, phase === "apply" ? "applying" : "queued"),
        ),
      )
      .returning({ id: importBatches.id });
    if (changed.length)
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        entityType: "import_batch",
        entityId: batchId,
        action: "import.dispatch_failed",
        metadata: { phase },
      });
  });
}

export async function getRegistrationImportPreview(
  actor: Actor,
  batchId: string,
) {
  requirePermission(actor, "import:manage");
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(
      and(
        eq(importBatches.id, batchId),
        eq(importBatches.organizationId, actor.organizationId),
      ),
    );
  if (!batch)
    throw new ApplicationError("NOT_FOUND", "Import batch not found.");
  return toPreview(
    batch,
    await db.select().from(importRows).where(eq(importRows.batchId, batch.id)),
  );
}

export async function getRegistrationImportWorkspace(actor: Actor) {
  requirePermission(actor, "import:manage");
  return db
    .select({
      id: programs.id,
      name: programs.name,
      seasonName: seasons.name,
    })
    .from(programs)
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );
}

export async function getRegistrationImportHistory(
  actor: Actor,
  programId: string,
) {
  requirePermission(actor, "import:manage");
  await assertProgram(actor, programId);
  return db
    .select({
      batchId: importBatches.id,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
    })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.organizationId, actor.organizationId),
        eq(importBatches.programId, programId),
      ),
    )
    .orderBy(desc(importBatches.createdAt))
    .limit(20);
}

export async function requestRegistrationImportApply(
  actor: Actor,
  input: { batchId: string },
) {
  requirePermission(actor, "import:manage");
  const parsed = applyRegistrationImportSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId))
      .for("update");
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, parsed.batchId),
          eq(importBatches.organizationId, actor.organizationId),
        ),
      )
      .for("update");
    if (!batch) throw new ApplicationError("NOT_FOUND", "Import not found.");
    if (batch.status === "applied") return { batchId: batch.id, start: false };
    if (!["ready", "ready_for_review", "applying"].includes(batch.status))
      throw new ApplicationError(
        "INVALID_STATE",
        "Only reconciled imports can be applied.",
      );
    const preview = await toPreview(
      batch,
      await tx
        .select()
        .from(importRows)
        .where(eq(importRows.batchId, batch.id)),
    );
    if (preview.identityReview.some((item) => !item.decision))
      throw new ApplicationError(
        "VALIDATION",
        "Review possible existing students before applying the import.",
      );
    await tx
      .update(importBatches)
      .set({
        status: "applying",
        workflowPhase: "applying",
        failureCode: null,
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, batch.id));
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "import_batch",
      entityId: batch.id,
      action: "import.apply_requested",
      metadata: {},
    });
    return { batchId: batch.id, start: true };
  });
}

export async function saveImportIdentityDecision(
  actor: Actor,
  input: z.infer<typeof importIdentityDecisionSchema>,
) {
  requirePermission(actor, "import:manage");
  const parsed = importIdentityDecisionSchema.parse(input);
  await db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId))
      .for("update");
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, parsed.batchId),
          eq(importBatches.organizationId, actor.organizationId),
        ),
      )
      .for("update");
    if (!batch) throw new ApplicationError("NOT_FOUND", "Import not found.");
    if (!["ready", "ready_for_review"].includes(batch.status))
      throw new ApplicationError(
        "INVALID_STATE",
        "This import is not ready for identity review.",
      );
    if (parsed.studentId !== "new") {
      const [student] = await tx
        .select({ id: people.id })
        .from(students)
        .innerJoin(people, eq(people.id, students.personId))
        .where(
          and(
            eq(people.id, parsed.studentId),
            eq(people.organizationId, actor.organizationId),
            isNull(people.archivedAt),
          ),
        );
      if (!student)
        throw new ApplicationError(
          "NOT_FOUND",
          "Student is no longer available.",
        );
    }
    const rows = await tx
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, batch.id));
    const matching = rows.filter(
      (row) =>
        (row.normalized as StoredFact).participantKey === parsed.participantKey,
    );
    if (!matching.length)
      throw new ApplicationError(
        "NOT_FOUND",
        "Participant not found in this import.",
      );
    for (const row of matching)
      await tx
        .update(importRows)
        .set({
          matchDecision: {
            studentId: parsed.studentId,
            reviewedBy: actor.userId,
          },
          updatedAt: new Date(),
        })
        .where(eq(importRows.id, row.id));
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "import_batch",
      entityId: batch.id,
      action: "import.identity_reviewed",
      metadata: {
        rowCount: matching.length,
        decision: parsed.studentId === "new" ? "create" : "link",
      },
    });
  });
  return getRegistrationImportPreview(actor, parsed.batchId);
}

export async function applyRegistrationImport(
  actor: Actor,
  input: { batchId: string },
) {
  requirePermission(actor, "import:manage");
  const parsed = applyRegistrationImportSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId))
      .for("update");
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, parsed.batchId),
          eq(importBatches.organizationId, actor.organizationId),
        ),
      );
    if (!batch || !batch.programId)
      throw new ApplicationError("NOT_FOUND", "Import batch not found.");
    if (batch.status === "applied")
      return { applied: false, batchId: batch.id };
    if (!["ready", "ready_for_review", "applying"].includes(batch.status))
      throw new ApplicationError(
        "INVALID_STATE",
        "Only a reconciled import without unresolved issues can be applied.",
      );

    const [program] = await tx
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.id, batch.programId));
    if (!program) throw new ApplicationError("NOT_FOUND", "Program not found.");
    const disciplineRows = await tx
      .select()
      .from(disciplines)
      .where(eq(disciplines.programId, batch.programId));
    const levelRows = await tx
      .select()
      .from(abilityLevels)
      .where(eq(abilityLevels.programId, batch.programId));
    const stagedRows = await tx
      .select()
      .from(importRows)
      .where(eq(importRows.batchId, batch.id));
    const facts = stagedRows.map((row) => row.normalized as StoredFact);
    const candidates = await tx
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
      })
      .from(students)
      .innerJoin(people, eq(people.id, students.personId))
      .where(
        and(
          eq(people.organizationId, actor.organizationId),
          isNull(people.archivedAt),
        ),
      );
    let created = 0;
    let returned = 0;
    for (const fact of facts) {
      const [source] = await tx
        .select()
        .from(registrationSources)
        .where(
          and(
            eq(registrationSources.organizationId, actor.organizationId),
            eq(registrationSources.sourceSystem, sourceSystem),
            eq(registrationSources.sourceKey, fact.sourceKey),
          ),
        );
      if (source) {
        const [enrollment] = await tx
          .select({ programId: registrations.programId })
          .from(registrations)
          .where(eq(registrations.id, source.registrationId));
        if (enrollment?.programId !== batch.programId)
          throw new ApplicationError(
            "VALIDATION",
            "This export contains a registration already imported into another program. Choose the original program.",
          );
      }
      if (fact.status === "returned") {
        if (source) {
          await tx
            .update(registrations)
            .set({ status: "returned", updatedAt: new Date() })
            .where(eq(registrations.id, source.registrationId));
          await tx
            .update(registrationSources)
            .set({
              sourceStatus: "returned",
              lastSeenBatchId: batch.id,
              updatedAt: new Date(),
            })
            .where(eq(registrationSources.id, source.id));
          returned += 1;
        }
        continue;
      }
      const [identity] = await tx
        .select()
        .from(externalIdentities)
        .where(
          and(
            eq(externalIdentities.organizationId, actor.organizationId),
            eq(externalIdentities.sourceSystem, sourceSystem),
            eq(externalIdentities.entityType, "person"),
            eq(externalIdentities.externalId, fact.participantKey),
          ),
        );
      let studentId = identity?.entityId;
      if (studentId) {
        const [person] = await tx
          .select({ id: people.id })
          .from(people)
          .where(
            and(
              eq(people.id, studentId),
              eq(people.organizationId, actor.organizationId),
              isNull(people.archivedAt),
            ),
          );
        if (!person)
          throw new ApplicationError(
            "VALIDATION",
            "An Aspenware identity points to an archived or unavailable person. Review the roster before importing.",
          );
        await tx
          .insert(students)
          .values({ personId: studentId })
          .onConflictDoNothing();
      }
      if (!studentId) {
        const decision = stagedRows.find(
          (row) =>
            (row.normalized as StoredFact).participantKey ===
              fact.participantKey && row.matchDecision,
        )?.matchDecision?.studentId;
        const matches = possibleImportedStudents(fact.studentName, candidates);
        if (decision && decision !== "new") {
          if (!candidates.some((candidate) => candidate.id === decision))
            throw new ApplicationError(
              "VALIDATION",
              "An identity decision refers to an unavailable student. Review it again.",
            );
          studentId = String(decision);
          await tx.insert(externalIdentities).values({
            organizationId: actor.organizationId,
            entityType: "person",
            entityId: studentId,
            sourceSystem,
            externalId: fact.participantKey,
          });
        } else if (matches.length && decision !== "new") {
          throw new ApplicationError(
            "VALIDATION",
            "Review students with matching names before applying this import.",
          );
        }
      }
      if (!studentId) {
        const [person] = await tx
          .insert(people)
          .values({
            organizationId: actor.organizationId,
            dateOfBirth: fact.dateOfBirth ?? null,
            firstName:
              fact.studentName.split(",").slice(1).join(" ").trim() ||
              "Unknown",
            lastName: fact.studentName.split(",")[0]?.trim() || "Student",
          })
          .returning({ id: people.id });
        if (!person)
          throw new ApplicationError(
            "INVALID_STATE",
            "Could not create student.",
          );
        studentId = person.id;
        await tx.insert(students).values({ personId: studentId });
        await tx.insert(externalIdentities).values({
          organizationId: actor.organizationId,
          entityType: "person",
          entityId: studentId,
          sourceSystem,
          externalId: fact.participantKey,
        });
        created += 1;
      }
      if (fact.dateOfBirth)
        await tx
          .update(people)
          .set({ dateOfBirth: fact.dateOfBirth, updatedAt: new Date() })
          .where(and(eq(people.id, studentId), isNull(people.dateOfBirth)));
      if (source && fact.placementNotes?.length) {
        const [existingRegistration] = await tx
          .select({ snapshot: registrations.sourceSnapshot })
          .from(registrations)
          .where(eq(registrations.id, source.registrationId));
        const oldNotes = Array.isArray(
          existingRegistration?.snapshot?.placementNotes,
        )
          ? existingRegistration.snapshot.placementNotes.filter(
              (note): note is string => typeof note === "string",
            )
          : [];
        await tx
          .update(registrations)
          .set({
            sourceSnapshot: {
              ...existingRegistration?.snapshot,
              placementNotes: [
                ...new Set([...oldNotes, ...fact.placementNotes]),
              ],
            },
            updatedAt: new Date(),
          })
          .where(eq(registrations.id, source.registrationId));
      }
      if (source) {
        await tx
          .update(registrationSources)
          .set({
            lastSeenBatchId: batch.id,
            sourceStatus: "active",
            updatedAt: new Date(),
          })
          .where(eq(registrationSources.id, source.id));
        await tx
          .update(registrations)
          .set({
            status: "active",
            disciplineId: sql`coalesce(${registrations.disciplineId}, ${disciplineRows.find((row) => row.key === fact.dimensions.discipline?.toLowerCase())?.id ?? null}::uuid)`,
            abilityLevelId: sql`coalesce(${registrations.abilityLevelId}, ${levelRows.find((row) => row.label === fact.abilityLevel)?.id ?? null}::uuid)`,
            updatedAt: new Date(),
          })
          .where(eq(registrations.id, source.registrationId));
        continue;
      }
      const disciplineId =
        disciplineRows.find(
          (row) => row.key === fact.dimensions.discipline?.toLowerCase(),
        )?.id ?? null;
      const abilityLevelId =
        levelRows.find((row) => row.label === fact.abilityLevel)?.id ?? null;
      const [registration] = await tx
        .insert(registrations)
        .values({
          studentId,
          programId: batch.programId,
          disciplineId,
          abilityLevelId,
          status: "active",
          sourceSnapshot: {
            sourceKey: fact.sourceKey,
            product: fact.product,
            productDate: fact.productDate,
            saleDate: fact.saleDate,
            sourceAge: fact.sourceAge,
            placementNotes: fact.placementNotes ?? [],
            weekday: fact.dimensions.weekday,
            session: fact.dimensions.session,
            ageBand: fact.dimensions.ageBand,
          },
        })
        .returning({ id: registrations.id });
      if (!registration)
        throw new ApplicationError(
          "INVALID_STATE",
          "Could not create registration.",
        );
      await tx.insert(registrationSources).values({
        registrationId: registration.id,
        organizationId: actor.organizationId,
        sourceSystem,
        sourceKey: fact.sourceKey,
        firstSeenBatchId: batch.id,
        lastSeenBatchId: batch.id,
        sourceStatus: "active",
      });
      if (fact.purchaser) {
        const [purchaserIdentity] = await tx
          .select()
          .from(externalIdentities)
          .where(
            and(
              eq(externalIdentities.organizationId, actor.organizationId),
              eq(externalIdentities.sourceSystem, sourceSystem),
              eq(externalIdentities.entityType, "person"),
              eq(externalIdentities.externalId, fact.purchaser.externalId),
            ),
          );
        let purchaserId = purchaserIdentity?.entityId;
        let purchaserWasCreated = false;
        if (!purchaserId) {
          const nameParts = fact.purchaser.name
            .split(",")
            .map((part) => part.trim());
          const [purchaser] = await tx
            .insert(people)
            .values({
              organizationId: actor.organizationId,
              firstName: nameParts[1] || "Purchaser",
              lastName: nameParts[0] || "Unknown",
            })
            .returning({ id: people.id });
          if (!purchaser)
            throw new ApplicationError(
              "INVALID_STATE",
              "Could not create purchaser.",
            );
          purchaserId = purchaser.id;
          purchaserWasCreated = true;
          await tx.insert(externalIdentities).values({
            organizationId: actor.organizationId,
            entityType: "person",
            entityId: purchaserId,
            sourceSystem,
            externalId: fact.purchaser.externalId,
          });
        }
        if (purchaserWasCreated) {
          const contacts = [
            fact.purchaser.email
              ? {
                  personId: purchaserId,
                  kind: "email",
                  value: fact.purchaser.email,
                }
              : null,
            fact.purchaser.phone
              ? {
                  personId: purchaserId,
                  kind: "phone",
                  value: fact.purchaser.phone,
                }
              : null,
          ].filter((contact) => contact !== null);
          if (contacts.length > 0)
            await tx.insert(contactMethods).values(contacts);
        }
        await tx.insert(registrationParties).values({
          registrationId: registration.id,
          personId: purchaserId,
          role: "purchaser",
          sourceSystem,
          sourceKey: `${fact.sourceKey}:purchaser`,
        });
      }
    }
    await tx
      .update(importBatches)
      .set({
        status: "applied",
        workflowPhase: "applied",
        failureCode: null,
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, batch.id));
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "import_batch",
      entityId: batch.id,
      action: "import.applied",
      metadata: { created, returned, batchId: batch.id },
    });
    const surveyMatching = await reconcileSurveyMatches(tx, actor);
    return {
      applied: true,
      batchId: batch.id,
      created,
      returned,
      surveyMatching,
    };
  });
}
