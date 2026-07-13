import { defineConfig } from "vitest/config";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [viteTsConfigPaths()],
  test: {
    env: {
      APP_ORIGIN: "http://127.0.0.1:3001",
      BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-characters",
      BETTER_AUTH_URL: "http://127.0.0.1:3001",
      DATABASE_URL: "postgresql://carve:carve@localhost:5433/carve",
      TEST_DATABASE_URL: "postgresql://carve:carve@localhost:5433/carve_test",
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
            DATABASE_URL: "postgresql://carve:carve@localhost:5433/carve_test",
            TEST_DATABASE_URL:
              "postgresql://carve:carve@localhost:5433/carve_test",
            LOG_LEVEL: "warn",
          },
        },
      },
    ],
  },
});
