import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { validateAspenwareImportFiles } from "../src/domain/imports/aspenware-upload";
import { previewAspenwareRegistrationBatch } from "../src/domain/imports/aspenware-registration";
import type { CsvRecord } from "../src/domain/imports/aspenware-registration";

const directory = process.argv[2];
if (!directory)
  throw new Error(
    "Usage: bun run scripts/inspect-registration-imports.ts <directory>",
  );
const names = (await readdir(directory)).filter((name) =>
  name.endsWith(".csv"),
);
const files = validateAspenwareImportFiles(
  await Promise.all(
    names.map(async (name) => ({
      name,
      content: await readFile(resolve(directory, name), "utf8"),
    })),
  ),
);
const records = (kind: string): Array<CsvRecord> | undefined => {
  const file = files.find((item) => item.sourceKind === kind);
  return file
    ? parse(file.content, { columns: true, bom: true, skip_empty_lines: true })
    : undefined;
};
const listing = records("listing")!;
const preview = previewAspenwareRegistrationBatch({
  listingRecords: listing.map((row) => ({
    ...row,
    Product: row.DetailRowC4!,
    "Product Date": row.DetailRowC2!,
    Qty: row.DetailRowC3!,
    "Net Amount": row.DetailRowC5!,
    "Transaction Type / Reservation Status": row.DetailRowC6!,
  })),
  byOrderRecords: records("by_order"),
  promptRecords: records("prompts"),
  birthdateRecords: records("customer_dob"),
});
console.info(
  JSON.stringify(
    {
      sourceCounts: preview.sourceCounts,
      summary: preview.summary,
      issues: preview.issues,
    },
    null,
    2,
  ),
);
