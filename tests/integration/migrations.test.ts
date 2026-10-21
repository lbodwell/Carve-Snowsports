import { resolve, sep } from "node:path";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  MIGRATION_LOCK,
  runReleaseMigrations,
} from "../../scripts/migrate-release";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for integration tests. Set it to the local carve_test database.",
  );
}

const testUrl = new URL(testDatabaseUrl);

if (
  !["localhost", "127.0.0.1", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/carve_test"
) {
  throw new Error(
    "TEST_DATABASE_URL must point to the local database named carve_test.",
  );
}

const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";

const adminSql = postgres(adminUrl.toString(), { max: 1 });
const testSql = postgres(testUrl.toString(), { max: 1 });
const releaseEnv = {
  RELEASE_ENVIRONMENT: "test",
  DATABASE_URL_UNPOOLED: testUrl.toString(),
  RELEASE_DATABASE_HOST: testUrl.hostname,
  RELEASE_DATABASE_NAME: "carve_test",
};

describe("database migrations", () => {
  beforeAll(async () => {
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.unsafe("CREATE DATABASE carve_test");

    await migrate(drizzle(testSql), {
      migrationsFolder: resolve(process.cwd(), "src/db/migrations"),
    });
  });

  afterAll(async () => {
    await testSql.end({ timeout: 5 });
    await adminSql.unsafe("DROP DATABASE IF EXISTS carve_test WITH (FORCE)");
    await adminSql.end({ timeout: 5 });
  });

  test("applies every migration to a clean database", async () => {
    const tables = await testSql<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    const tableNames = tables.map((table) => table.tablename);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "accounts",
        "group_revision_memberships",
        "grouping_draft_instructors",
        "grouping_drafts",
        "import_batches",
        "import_files",
        "lesson_attendance",
        "lesson_instances",
        "organizations",
        "organization_invitations",
        "registrations",
        "registration_parties",
        "registration_sources",
        "students",
        "survey_invitations",
        "survey_responses",
        "surveys",
      ]),
    );

    const [migrationCount] = await testSql<Array<{ count: string }>>`
      SELECT count(*) FROM drizzle.__drizzle_migrations
    `;

    expect(migrationCount?.count).toBe("16");
  });

  test("release checks verify existing history and reapplying is a no-op", async () => {
    await expect(
      runReleaseMigrations({ env: releaseEnv, checkOnly: true }),
    ).resolves.toMatchObject({ pending: 0, total: 16, checkedOnly: true });
    await expect(
      runReleaseMigrations({ env: releaseEnv }),
    ).resolves.toMatchObject({ pending: 0, total: 16 });
  });

  test("overlapping migration runners cannot enter the database together", async () => {
    await testSql`select pg_advisory_lock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]})`;
    try {
      await expect(runReleaseMigrations({ env: releaseEnv })).rejects.toThrow(
        "Another release migration",
      );
    } finally {
      await testSql`select pg_advisory_unlock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]})`;
    }
    await expect(
      runReleaseMigrations({ env: releaseEnv, checkOnly: true }),
    ).resolves.toMatchObject({ pending: 0 });
  });

  test("edited migration history blocks a release", async () => {
    const [first] =
      await testSql`select id, hash from drizzle.__drizzle_migrations order by id limit 1`;
    await testSql`update drizzle.__drizzle_migrations set hash = 'invalid-history-fixture' where id = ${first!.id}`;
    try {
      await expect(runReleaseMigrations({ env: releaseEnv })).rejects.toThrow(
        "migration history differs",
      );
    } finally {
      await testSql`update drizzle.__drizzle_migrations set hash = ${first!.hash} where id = ${first!.id}`;
    }
  });

  test("a failed pending migration rolls back its DDL and journal entry", async () => {
    const fixtureRoot = resolve(process.cwd(), ".tmp");
    await mkdir(fixtureRoot, { recursive: true });
    const fixture = await mkdtemp(resolve(fixtureRoot, "migration-failure-"));
    if (!resolve(fixture).startsWith(fixtureRoot + sep))
      throw new Error("Unexpected fixture cleanup path.");
    try {
      await mkdir(resolve(fixture, "meta"));
      const source = resolve(process.cwd(), "src/db/migrations");
      const journal = JSON.parse(
        await readFile(resolve(source, "meta/_journal.json"), "utf8"),
      );
      for (const entry of journal.entries)
        await copyFile(
          resolve(source, `${entry.tag}.sql`),
          resolve(fixture, `${entry.tag}.sql`),
        );
      const last = journal.entries.at(-1);
      journal.entries.push({
        ...last,
        idx: last.idx + 1,
        when: last.when + 1000,
        tag: "9999_failed_release_fixture",
      });
      await writeFile(
        resolve(fixture, "meta/_journal.json"),
        JSON.stringify(journal),
      );
      await writeFile(
        resolve(fixture, "9999_failed_release_fixture.sql"),
        "CREATE TABLE failed_release_fixture (id integer);--> statement-breakpoint\nSELECT 1 / 0;",
      );
      await expect(
        runReleaseMigrations({ env: releaseEnv, migrationsFolder: fixture }),
      ).rejects.toThrow();
      const [table] =
        await testSql`select to_regclass('public.failed_release_fixture') as name`;
      expect(table?.name).toBeNull();
      const [count] =
        await testSql`select count(*)::int as count from drizzle.__drizzle_migrations`;
      expect(count?.count).toBe(16);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
