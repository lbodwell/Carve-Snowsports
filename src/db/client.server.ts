import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/server/env.server";
import * as schema from "@/db/schema";

const sql = postgres(env.DATABASE_URL, {
  max: 10,
  prepare: false,
});

export const db = drizzle({ client: sql, schema });

export async function closeDatabaseConnection() {
  await sql.end({ timeout: 5 });
}
