import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { z } from "zod";
import type { Actor } from "@/application/policies/authorization";
import { requirePermission } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import {
  deleteImportObject,
  getImportObjectBytes,
} from "@/application/ports/import-storage.server";
import {
  queueRegistrationImport,
  queueRegistrationImportZip,
} from "@/application/services/registration-import-service.server";
import { validateAspenwareImportFiles } from "@/domain/imports/aspenware-upload";
import { db } from "@/db/client.server";
import { programs, seasons } from "@/db/schema";

const fileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});
export const prepareImportUploadSchema = fileSchema.extend({
  programId: z.uuid(),
});
export const storedImportUploadSchema = z.object({
  programId: z.uuid(),
  files: z
    .array(fileSchema.extend({ key: z.string().max(500) }))
    .min(1)
    .max(3),
});

async function assertProgram(actor: Actor, programId: string) {
  requirePermission(actor, "import:manage");
  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .innerJoin(seasons, eq(seasons.id, programs.seasonId))
    .where(
      and(
        eq(programs.id, programId),
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );
  if (!program) throw new ApplicationError("NOT_FOUND", "Program not found.");
}

export async function prepareImportUpload(
  actor: Actor,
  input: z.infer<typeof prepareImportUploadSchema>,
) {
  requirePermission(actor, "import:manage");
  const parsed = prepareImportUploadSchema.parse(input);
  await assertProgram(actor, parsed.programId);
  // Local installs keep the existing private filesystem transport.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (process.env.VERCEL)
      throw new ApplicationError(
        "INVALID_STATE",
        "Configure private Blob client uploads before importing files.",
      );
    return null;
  }
  const extension = parsed.name.toLowerCase().endsWith(".zip")
    ? "zip"
    : parsed.name.toLowerCase().endsWith(".csv")
      ? "csv"
      : null;
  if (!extension)
    throw new ApplicationError(
      "VALIDATION",
      "Choose a CSV export or ZIP archive.",
    );
  const key = `pending-imports/${actor.organizationId}/${actor.userId}/${randomUUID()}.${extension}`;
  const token = await generateClientTokenFromReadWriteToken({
    pathname: key,
    maximumSizeInBytes: 10 * 1024 * 1024,
    allowedContentTypes:
      extension === "zip" ? ["application/zip"] : ["text/csv"],
    validUntil: Date.now() + 5 * 60_000,
    allowOverwrite: false,
    addRandomSuffix: false,
  });
  return {
    key,
    token,
    contentType: extension === "zip" ? "application/zip" : "text/csv",
  };
}

export async function queueStoredImport(
  actor: Actor,
  input: z.infer<typeof storedImportUploadSchema>,
) {
  requirePermission(actor, "import:manage");
  const parsed = storedImportUploadSchema.parse(input);
  await assertProgram(actor, parsed.programId);
  const prefix = `pending-imports/${actor.organizationId}/${actor.userId}/`;
  for (const file of parsed.files) {
    if (
      !file.key.startsWith(prefix) ||
      !/^[0-9a-f-]{36}\.(csv|zip)$/.test(file.key.slice(prefix.length))
    )
      throw new ApplicationError(
        "FORBIDDEN",
        "This upload does not belong to your session.",
      );
  }
  const files = await Promise.all(
    parsed.files.map(async (file) => {
      const bytes = await getImportObjectBytes(file.key);
      if (bytes.byteLength !== file.size || bytes.byteLength > 10 * 1024 * 1024)
        throw new ApplicationError(
          "VALIDATION",
          "Uploaded file size did not match. Upload it again.",
        );
      return { ...file, bytes };
    }),
  );
  const archive = files.find((file) =>
    file.name.toLowerCase().endsWith(".zip"),
  );
  let queued: { batchId: string; status: string };
  if (archive) {
    if (files.length !== 1)
      throw new ApplicationError(
        "VALIDATION",
        "Upload one ZIP or individual CSVs.",
      );
    queued = await queueRegistrationImportZip(actor, {
      programId: parsed.programId,
      archiveName: "imports.zip",
      archiveBase64: archive.bytes.toString("base64"),
    });
  } else {
    const validated = validateAspenwareImportFiles(
      files.map((file) => ({
        name: file.name,
        content: file.bytes.toString("utf8"),
      })),
    );
    const listing = validated.find((file) => file.sourceKind === "listing")!;
    const byOrder = validated.find((file) => file.sourceKind === "by_order");
    const prompts = validated.find((file) => file.sourceKind === "prompts");
    queued = await queueRegistrationImport(actor, {
      programId: parsed.programId,
      listingCsv: listing.content,
      listingName: listing.name,
      byOrderCsv: byOrder?.content,
      byOrderName: byOrder?.name,
      promptCsv: prompts?.content,
      promptName: prompts?.name,
    });
  }
  // These are this actor's temporary transfer objects, not batch source files.
  await Promise.allSettled(
    parsed.files.map((file) => deleteImportObject(file.key)),
  );
  return queued;
}
