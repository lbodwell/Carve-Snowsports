import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import {
  previewSchemaState,
  verifiedPreviewDatabase,
} from "../src/domain/deployment/preview-policy";
import type {
  AppliedMigration,
  CommittedMigration,
} from "../src/domain/deployment/preview-policy";

export async function readAppliedMigrations(client: postgres.Sql) {
  const [table] =
    await client`select to_regclass('drizzle.__drizzle_migrations') as name`;
  return table?.name
    ? await client<
        Array<AppliedMigration>
      >`select hash, created_at from drizzle.__drizzle_migrations order by created_at, id`
    : [];
}

export async function waitForMigrationHistory(options: {
  committed: ReadonlyArray<CommittedMigration>;
  readApplied: () => Promise<ReadonlyArray<AppliedMigration>>;
  timeoutMs?: number;
  pollMs?: number;
  onPending?: () => void;
}) {
  const deadline = Date.now() + (options.timeoutMs ?? 12 * 60_000);
  for (;;) {
    let applied: ReadonlyArray<AppliedMigration> | undefined;
    try {
      applied = await options.readApplied();
    } catch {
      // Connection errors are retried without logging driver errors or credentials.
    }
    if (applied && previewSchemaState(options.committed, applied) === "ready")
      return;
    if (Date.now() >= deadline)
      throw new Error(
        "Preview schema is not ready. Check the PR's quality and Preview migration jobs, then redeploy. Branches with new migrations need an open same-repository PR targeting main.",
      );
    options.onPending?.();
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.min(options.pollMs ?? 5000, deadline - Date.now()),
      ),
    );
  }
}

export async function waitForPreviewSchema(
  env: Record<string, string | undefined>,
) {
  if (env.VERCEL_ENV !== "preview") return;
  const url = verifiedPreviewDatabase(env.DATABASE_URL);
  const committed = readMigrationFiles({
    migrationsFolder: fileURLToPath(
      new URL("../src/db/migrations", import.meta.url),
    ),
  });
  const client = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 10,
    ssl: { rejectUnauthorized: true },
    connection: { statement_timeout: 10_000 },
  });
  let nextLog = 0;
  console.log("Checking isolated Preview schema before building this commit.");
  try {
    await waitForMigrationHistory({
      committed,
      readApplied: () => readAppliedMigrations(client),
      onPending: () => {
        if (Date.now() >= nextLog) {
          console.log(
            "Waiting for GitHub Actions Preview migrations; no migrations run during this build.",
          );
          nextLog = Date.now() + 30_000;
        }
      },
    });
    console.log("Preview schema is ready for this commit.");
  } finally {
    await client.end({ timeout: 5 });
  }
}
