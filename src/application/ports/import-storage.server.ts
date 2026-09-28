import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { del, get, put } from "@vercel/blob";

export type StoredImportObject = {
  key: string;
  content: string;
};

const localRoot = resolve(process.cwd(), ".local-imports");
const isVercel = Boolean(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN);

function safeKey(key: string) {
  return key.replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\.\./g, "_");
}

export async function putImportObject(key: string, content: string) {
  const safe = safeKey(key);
  if (isVercel) {
    await put(safe, content, {
      access: "private",
      addRandomSuffix: false,
      contentType: "text/csv; charset=utf-8",
    });
    return safe;
  }
  const path = join(localRoot, safe);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
  return safe;
}

export async function getImportObject(key: string): Promise<StoredImportObject> {
  const safe = safeKey(key);
  if (isVercel) {
    const result = await get(safe, { access: "private" });
    if (!result || result.statusCode !== 200)
      throw new Error("Uploaded import file is unavailable.");
    return { key: safe, content: await new Response(result.stream).text() };
  }
  return { key: safe, content: await readFile(join(localRoot, safe), "utf8") };
}

export async function deleteImportObject(key: string) {
  const safe = safeKey(key);
  if (isVercel) {
    await del(safe);
    return;
  }
  await rm(join(localRoot, safe), { force: true });
}
