import { defineConfig } from "vitest/config";
import viteTsConfigPaths from "vite-tsconfig-paths";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://carve:carve@localhost:5433/carve_test";
const testTarget = new URL(testDatabaseUrl);
if (
  !["postgres:", "postgresql:"].includes(testTarget.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(testTarget.hostname) ||
  testTarget.pathname !== "/carve_test"
)
  throw new Error("Tests require a local Postgres database named carve_test.");

export default defineConfig({
  plugins: [viteTsConfigPaths()],
  test: {
    env: {
      APP_ORIGIN: "http://127.0.0.1:3001",
      BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-characters",
      BETTER_AUTH_URL: "http://127.0.0.1:3001",
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      LOG_LEVEL: "warn",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
          env: {
            APP_ORIGIN: "http://127.0.0.1:3001",
            BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-characters",
            BETTER_AUTH_URL: "http://127.0.0.1:3001",
            DATABASE_URL: testDatabaseUrl,
            TEST_DATABASE_URL: testDatabaseUrl,
            LOG_LEVEL: "warn",
          },
        },
      },
    ],
  },
});
