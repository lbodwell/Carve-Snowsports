import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

export async function signInAsAdmin(page: Page) {
  const state = JSON.parse(await readFile(".tmp/e2e-admin.json", "utf8"));
  await page.context().addCookies(state.cookies);
  await page.goto("/admin");
}
