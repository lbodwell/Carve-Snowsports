import { defineConfig, devices } from "@playwright/test";

const e2ePort = 3101;
const baseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Keep browser tests isolated from a developer's normal server on 3001.
    command: `bun run dev -- --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
