import { defineConfig, devices } from "@playwright/test";

const e2ePort = 3101;
const baseURL = `http://127.0.0.1:${e2ePort}`;

// A locally pulled Vercel environment must never select a remote workflow world
// or Preview auth origin. The Workflow SDK tests presence, not just truthiness.
for (const key of [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_OIDC_TOKEN",
])
  delete process.env[key];

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Keep browser tests isolated from a developer's normal server on 3001.
    command:
      "node node_modules/vite/bin/vite.js build && node .output/server/index.mjs",
    env: {
      APP_ORIGIN: baseURL,
      NODE_ENV: "production",
      PORT: String(e2ePort),
      HOST: "127.0.0.1",
      BETTER_AUTH_URL: baseURL,
      DEV_IMPERSONATE_USER_EMAIL: "",
      CARVE_LOCAL_RUNTIME: "1",
      // bun loads .env.local; a pulled Preview environment must not redirect
      // local auth or issue secure cookies for a remote deployment origin.
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
      BLOB_READ_WRITE_TOKEN: "",
      WORKFLOW_LOCAL_BASE_URL: baseURL,
      WORKFLOW_LOCAL_DATA_DIR: ".tmp/e2e-workflows",
      WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false",
    },
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
