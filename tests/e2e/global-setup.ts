import { mkdir } from "node:fs/promises";
import { expect, request } from "@playwright/test";
import type { FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  const client = await request.newContext({ baseURL });
  try {
    const response = await client.post("/api/auth/sign-in/email", {
      headers: { Origin: baseURL },
      data: {
        email: "admin@carve.local",
        password: process.env.DEV_ADMIN_PASSWORD ?? "carve-local-admin",
      },
    });
    expect(response.ok()).toBe(true);
    await mkdir(".tmp", { recursive: true });
    await client.storageState({ path: ".tmp/e2e-admin.json" });
  } finally {
    await client.dispose();
  }
}
