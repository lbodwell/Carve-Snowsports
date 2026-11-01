import target from "../../../config/preview-database.json";
import { assertMigrationHistory } from "./release-policy";

export type CommittedMigration = { folderMillis: number; hash: string };
export type AppliedMigration = {
  created_at: string | number | null;
  hash: string;
};

export function previewSchemaState(
  committed: ReadonlyArray<CommittedMigration>,
  applied: ReadonlyArray<AppliedMigration>,
) {
  // Other previews may have applied newer additive migrations. Never accept a
  // different history for migrations this checkout knows about.
  try {
    assertMigrationHistory(committed, applied.slice(0, committed.length));
  } catch {
    throw new Error(
      "Preview migration history conflicts with this commit. Rebase onto the shared Preview migration history; never rewrite an applied migration.",
    );
  }
  return applied.length >= committed.length ? "ready" : "pending";
}

export function verifiedPreviewDatabase(value: string | undefined) {
  if (!value) throw new Error("Preview DATABASE_URL is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Preview DATABASE_URL is invalid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname.replace(/-pooler(?=\.)/, "") !== target.host ||
    decodeURIComponent(url.pathname.slice(1)) !== target.database
  )
    throw new Error(
      "Preview must use the configured isolated Preview database.",
    );
  return value;
}
