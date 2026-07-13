import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

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
        "lesson_attendance",
        "lesson_instances",
        "organizations",
        "organization_invitations",
        "registrations",
        "students",
      ]),
    );

    const [migrationCount] = await testSql<Array<{ count: string }>>`
      SELECT count(*) FROM drizzle.__drizzle_migrations
    `;

    expect(migrationCount?.count).toBe("11");
  });
});
