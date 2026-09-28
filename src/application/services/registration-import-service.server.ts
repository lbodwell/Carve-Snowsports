import { createHash } from "node:crypto";

import AdmZip from "adm-zip";
import { and, eq, isNull } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import type { AspenwareImportFact, CsvRecord } from "@/domain/imports/aspenware-registration";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { getImportObject, putImportObject } from "@/application/ports/import-storage.server";
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

const adapter = "aspenware-registration";
const sourceSystem = "aspenware";

const optionalCsv = z.string().min(1).optional();
export const previewRegistrationImportSchema = z.object({
  programId: z.uuid(),
  listingCsv: z.string().min(1),
  listingName: z.string().trim().min(1).max(255),
  byOrderCsv: optionalCsv,
  byOrderName: z.string().trim().min(1).max(255).optional(),
  promptCsv: optionalCsv,
  promptName: z.string().trim().min(1).max(255).optional(),
});
export const applyRegistrationImportSchema = z.object({ batchId: z.uuid() });
export const queueRegistrationZipSchema = z.object({
  programId: z.uuid(),
  archiveName: z.string().trim().endsWith(".zip"),
  archiveBase64: z.string().min(1).max(20 * 1024 * 1024),
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
      ? [{ kind: "by_order", content: input.byOrderCsv, name: input.byOrderName ?? "by-order.csv" }]
      : []),
    ...(input.promptCsv
      ? [{ kind: "prompts", content: input.promptCsv, name: input.promptName ?? "prompts.csv" }]
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

function toPreview(batch: typeof importBatches.$inferSelect, rows: Array<typeof importRows.$inferSelect>) {
  const facts = rows.map((row) => row.normalized as StoredFact);
  const values = batch.reconciliation ?? {};
  const numberValue = (key: string) =>
    typeof values[key] === "number" ? values[key] : 0;
  return {
    batchId: batch.id,
    status: batch.status,
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
      issues: fact.issues,
    })),
  };
}

export async function previewRegistrationImport(actor: Actor, input: PreviewInput) {
  requirePermission(actor, "import:manage");
  const parsed = previewRegistrationImportSchema.parse(input);
  await assertProgram(actor, parsed.programId);
  const files = sourceFiles(parsed);
  const inputSetHash = hash(files.map((file) => `${file.kind}:${hash(file.content)}`).join("|"));
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
    const rows = await db.select().from(importRows).where(eq(importRows.batchId, existing.id));
    return toPreview(existing, rows);
  }

  const listingRecords = csvRecords(parsed.listingCsv, "Listing").map(remapListing);
  const byOrderRecords = parsed.byOrderCsv
    ? csvRecords(parsed.byOrderCsv, "By-order")
    : undefined;
  const promptRecords = parsed.promptCsv
    ? csvRecords(parsed.promptCsv, "Prompt").map(remapPrompt)
    : undefined;
  const preview = previewAspenwareRegistrationBatch({
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
        },
      })
      .returning();
    if (!created) throw new ApplicationError("INVALID_STATE", "Could not create import batch.");
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
  return toPreview(batch, await db.select().from(importRows).where(eq(importRows.batchId, batch.id)));
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
    files.map((file) => `${file.sourceKind}:${hash(file.content)}`).join("|"),
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
    if (!created) throw new ApplicationError("INVALID_STATE", "Could not queue import.");
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
  const files = archive.getEntries().flatMap((entry) => {
    if (entry.isDirectory) return [];
    if (
      entry.entryName.includes("..") ||
      entry.entryName.startsWith("/") ||
      entry.entryName.includes("\\")
    )
      throw new ApplicationError("VALIDATION", "ZIP contains an unsafe file path.");
    if (entry.header.flags & 1)
      throw new ApplicationError("VALIDATION", "Encrypted ZIP archives are not supported.");
    const data = entry.getData();
    if (data.byteLength > 10 * 1024 * 1024)
      throw new ApplicationError("VALIDATION", `${entry.entryName} exceeds the 10 MB limit.`);
    return [{ name: entry.name, content: data.toString("utf8") }];
  });
  const validated = validateAspenwareImportFiles(files);
  const bySource = new Map(validated.map((file) => [file.sourceKind, file]));
  const listing = bySource.get("listing");
  if (!listing) throw new ApplicationError("VALIDATION", "Customer product listing is required.");
  const byOrder = bySource.get("by_order");
  const prompts = bySource.get("prompts");
  return queueRegistrationImport(actor, {
    programId: parsed.programId,
    listingCsv: listing.content,
    listingName: listing.name,
    byOrderCsv: byOrder?.content,
    byOrderName: byOrder?.name,
    promptCsv: prompts?.content,
    promptName: prompts?.name,
  });
}

export async function processQueuedRegistrationImport(batchId: string) {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) throw new ApplicationError("NOT_FOUND", "Import batch not found.");
  if (!["queued", "processing"].includes(batch.status))
    return { batchId, status: batch.status };
  await db
    .update(importBatches)
    .set({ status: "processing", workflowPhase: "reconciling", updatedAt: new Date() })
    .where(eq(importBatches.id, batchId));
  try {
    const fileRows = await db.select().from(importFiles).where(eq(importFiles.batchId, batchId));
    const contents = await Promise.all(
      fileRows.map(async (file) => {
        if (!file.storageKey) throw new Error("Import file has no storage object.");
        return { sourceKind: file.sourceKind, content: (await getImportObject(file.storageKey)).content };
      }),
    );
    const listing = contents.find((file) => file.sourceKind === "listing");
    if (!listing) throw new Error("Customer product listing is required.");
    const byOrder = contents.find((file) => file.sourceKind === "by_order");
    const prompts = contents.find((file) => file.sourceKind === "prompts");
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: csvRecords(listing.content, "Listing").map(remapListing),
      byOrderRecords: byOrder ? csvRecords(byOrder.content, "By-order") : undefined,
      promptRecords: prompts ? csvRecords(prompts.content, "Prompt").map(remapPrompt) : undefined,
    });
    await db.transaction(async (tx) => {
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
          reconciliation: { ...preview.summary, sourceCounts: preview.sourceCounts, issueCount: preview.issues.length },
          updatedAt: new Date(),
        })
        .where(eq(importBatches.id, batchId));
    });
    return { batchId, status: preview.issues.length ? "needs_review" : "ready_for_review" };
  } catch (error) {
    await db
      .update(importBatches)
      .set({ status: "failed", workflowPhase: "failed", failureCode: "PROCESSING_FAILED", updatedAt: new Date() })
      .where(eq(importBatches.id, batchId));
    throw error;
  }
}

export async function getRegistrationImportPreview(actor: Actor, batchId: string) {
  requirePermission(actor, "import:manage");
  const [batch] = await db.select().from(importBatches).where(
    and(eq(importBatches.id, batchId), eq(importBatches.organizationId, actor.organizationId)),
  );
  if (!batch) throw new ApplicationError("NOT_FOUND", "Import batch not found.");
  return toPreview(batch, await db.select().from(importRows).where(eq(importRows.batchId, batch.id)));
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

export async function applyRegistrationImport(actor: Actor, input: { batchId: string }) {
  requirePermission(actor, "import:manage");
  const parsed = applyRegistrationImportSchema.parse(input);
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(importBatches).where(
      and(eq(importBatches.id, parsed.batchId), eq(importBatches.organizationId, actor.organizationId)),
    );
    if (!batch || !batch.programId)
      throw new ApplicationError("NOT_FOUND", "Import batch not found.");
    if (batch.status === "applied") return { applied: false, batchId: batch.id };
    if (batch.status === "needs_review")
      throw new ApplicationError("INVALID_STATE", "Resolve import issues before applying this batch.");

    const [program] = await tx
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.id, batch.programId));
    if (!program) throw new ApplicationError("NOT_FOUND", "Program not found.");
    const disciplineRows = await tx.select().from(disciplines).where(eq(disciplines.programId, batch.programId));
    const levelRows = await tx.select().from(abilityLevels).where(eq(abilityLevels.programId, batch.programId));
    const facts = (await tx.select().from(importRows).where(eq(importRows.batchId, batch.id)))
      .map((row) => row.normalized as StoredFact);
    let created = 0;
    let returned = 0;
    for (const fact of facts) {
      const [source] = await tx.select().from(registrationSources).where(
        and(eq(registrationSources.organizationId, actor.organizationId), eq(registrationSources.sourceSystem, sourceSystem), eq(registrationSources.sourceKey, fact.sourceKey)),
      );
      if (fact.status === "returned") {
        if (source) {
          await tx.update(registrations).set({ status: "returned", updatedAt: new Date() }).where(eq(registrations.id, source.registrationId));
          await tx.update(registrationSources).set({ sourceStatus: "returned", lastSeenBatchId: batch.id, updatedAt: new Date() }).where(eq(registrationSources.id, source.id));
          returned += 1;
        }
        continue;
      }
      const [identity] = await tx.select().from(externalIdentities).where(
        and(
          eq(externalIdentities.organizationId, actor.organizationId),
          eq(externalIdentities.sourceSystem, sourceSystem),
          eq(externalIdentities.entityType, "person"),
          eq(externalIdentities.externalId, fact.participantKey),
        ),
      );
      let studentId = identity?.entityId;
      if (!studentId) {
        const [person] = await tx.insert(people).values({
          organizationId: actor.organizationId,
          firstName: fact.studentName.split(",").slice(1).join(" ").trim() || "Unknown",
          lastName: fact.studentName.split(",")[0]?.trim() || "Student",
        }).returning({ id: people.id });
        if (!person) throw new ApplicationError("INVALID_STATE", "Could not create student.");
        studentId = person.id;
        await tx.insert(students).values({ personId: studentId });
        await tx.insert(externalIdentities).values({
          organizationId: actor.organizationId, entityType: "person", entityId: studentId,
          sourceSystem, externalId: fact.participantKey,
        });
        created += 1;
      }
      if (source) continue;
      const disciplineId = disciplineRows.find((row) => row.key === fact.dimensions.discipline?.toLowerCase())?.id ?? null;
      const abilityLevelId = levelRows.find((row) => row.label === fact.abilityLevel)?.id ?? null;
      const [registration] = await tx.insert(registrations).values({
        studentId, programId: batch.programId, disciplineId, abilityLevelId, status: "active",
        sourceSnapshot: { sourceKey: fact.sourceKey, product: fact.product, productDate: fact.productDate, saleDate: fact.saleDate, sourceAge: fact.sourceAge, weekday: fact.dimensions.weekday, session: fact.dimensions.session, ageBand: fact.dimensions.ageBand },
      }).returning({ id: registrations.id });
      if (!registration) throw new ApplicationError("INVALID_STATE", "Could not create registration.");
      await tx.insert(registrationSources).values({
        registrationId: registration.id, organizationId: actor.organizationId, sourceSystem,
        sourceKey: fact.sourceKey, firstSeenBatchId: batch.id, lastSeenBatchId: batch.id, sourceStatus: "active",
      });
      if (fact.purchaser) {
        const [purchaserIdentity] = await tx.select().from(externalIdentities).where(
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
          const nameParts = fact.purchaser.name.split(",").map((part) => part.trim());
          const [purchaser] = await tx.insert(people).values({
            organizationId: actor.organizationId,
            firstName: nameParts[1] || "Purchaser",
            lastName: nameParts[0] || "Unknown",
          }).returning({ id: people.id });
          if (!purchaser) throw new ApplicationError("INVALID_STATE", "Could not create purchaser.");
          purchaserId = purchaser.id;
          purchaserWasCreated = true;
          await tx.insert(externalIdentities).values({
            organizationId: actor.organizationId, entityType: "person", entityId: purchaserId,
            sourceSystem, externalId: fact.purchaser.externalId,
          });
        }
        if (purchaserWasCreated) {
          const contacts = [
            fact.purchaser.email
              ? { personId: purchaserId, kind: "email", value: fact.purchaser.email }
              : null,
            fact.purchaser.phone
              ? { personId: purchaserId, kind: "phone", value: fact.purchaser.phone }
              : null,
          ].filter((contact) => contact !== null);
          if (contacts.length > 0) await tx.insert(contactMethods).values(contacts);
        }
        await tx.insert(registrationParties).values({
          registrationId: registration.id, personId: purchaserId, role: "purchaser",
          sourceSystem, sourceKey: `${fact.sourceKey}:purchaser`,
        });
      }
    }
    await tx.update(importBatches).set({ status: "applied", updatedAt: new Date() }).where(eq(importBatches.id, batch.id));
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId, actorId: actor.userId, entityType: "import_batch",
      entityId: batch.id, action: "import.applied", metadata: { created, returned, batchId: batch.id },
    });
    return { applied: true, batchId: batch.id, created, returned };
  });
}
