import { sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";

import { db } from "@/db/client.server";

export const getServiceHealth = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true as const };
    } catch {
      return { ok: false as const };
    }
  },
);
