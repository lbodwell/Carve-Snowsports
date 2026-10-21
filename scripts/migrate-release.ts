import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  assertMigrationHistory,
  verifiedMigrationTarget,
} from "../src/domain/deployment/release-policy";

export const MIGRATION_LOCK = [1128354386, 1296648018] as const;

export async function runReleaseMigrations(options: {
  env: Record<string, string | undefined>;
  checkOnly?: boolean;
  migrationsFolder?: string;
}) {
  const target = verifiedMigrationTarget(options.env);
  const migrationsFolder =
    options.migrationsFolder ??
    fileURLToPath(new URL("../src/db/migrations", import.meta.url));
  const committed = readMigrationFiles({ migrationsFolder });
  const client = postgres(target.url, {
    max: 1,
    prepare: false,
    connect_timeout: 15,
    ssl: target.ssl ? { rejectUnauthorized: true } : false,
  });
  let locked = false;
  try {
    const [lock] =
      await client`select pg_try_advisory_lock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]}) as acquired`;
    if (!lock?.acquired)
      throw new Error(
        "Another release migration holds the database lock. Retry after it finishes.",
      );
    locked = true;
    await client`set lock_timeout = '10s'`;
    await client`set statement_timeout = '120s'`;
    const readApplied = async () => {
      const [table] =
        await client`select to_regclass('drizzle.__drizzle_migrations') as name`;
      return table?.name
        ? await client<
            Array<{ hash: string; created_at: string }>
          >`select hash, created_at from drizzle.__drizzle_migrations order by created_at, id`
        : [];
    };
    const applied = await readApplied();
    assertMigrationHistory(committed, applied);
    const pending = committed.length - applied.length;
    if (!options.checkOnly) {
      await migrate(drizzle(client), { migrationsFolder });
      const after = await readApplied();
      assertMigrationHistory(committed, after);
      if (after.length !== committed.length)
        throw new Error("Migration journal did not reach the expected commit.");
    }
    return {
      environment: target.environment,
      pending,
      total: committed.length,
      checkedOnly: Boolean(options.checkOnly),
    };
  } finally {
    try {
      if (locked)
        await client`select pg_advisory_unlock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]})`;
    } finally {
      await client.end({ timeout: 5 });
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await runReleaseMigrations({
      env: process.env,
      checkOnly: process.argv.includes("--check"),
    });
    console.log(JSON.stringify(result));
  } catch {
    // Driver errors may contain connection strings or query text. Do not print them.
    console.error(
      "Release migration failed. Verify the target, migration history, database lock, and reviewed SQL. No deployment will be promoted.",
    );
    process.exitCode = 1;
  }
}
