import { parse } from "csv-parse/sync";

export const importSourceKinds = ["listing", "by_order", "prompts"] as const;
export type ImportSourceKind = (typeof importSourceKinds)[number];

export type ValidatedImportFile = {
  sourceKind: ImportSourceKind;
  name: string;
  content: string;
  rowCount: number;
  headers: Array<string>;
};

const headersBySource: Record<ImportSourceKind, Array<string>> = {
  listing: [
    "DetailRowC0",
    "CustomerName",
    "textbox10",
    "DetailRowC1",
    "DetailRowC2",
    "DetailRowC3",
    "DetailRowC4",
    "DetailRowC5",
    "DetailRowC6",
  ],
  by_order: [
    "DetailRowC0",
    "CustomerName",
    "LineCustomerName",
    "Textbox21",
    "DetailRowC1",
    "DetailRowC2",
    "DetailRowC3",
    "DetailRowC4",
    "DetailRowC5",
    "DetailRowC6",
  ],
  prompts: [
    "TransactionID",
    "TransactionLineIPCode",
    "ProductDate",
    "ProductHeaderDescription",
    "PromptName1",
    "PromptData1",
    "TotalPrice",
  ],
};

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_FILE_COUNT = 3;

function parseHeader(content: string) {
  const [row] = parse(content, {
    bom: true,
    to_line: 1,
    relax_column_count: false,
  });
  if (!row || row.length === 0) throw new Error("CSV has no header row.");
  return row.map((header) => header.trim());
}

function sourceForHeaders(headers: Array<string>): ImportSourceKind | null {
  const matches = importSourceKinds.filter((source) =>
    headersBySource[source].every((header) => headers.includes(header)),
  );
  if (matches.length !== 1) return null;
  return matches[0] ?? null;
}

export function validateAspenwareCsv(
  name: string,
  content: string,
): ValidatedImportFile {
  if (!name.toLowerCase().endsWith(".csv"))
    throw new Error(`${name}: expected a CSV file.`);
  if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_FILE_BYTES)
    throw new Error(`${name}: file exceeds the 10 MB import limit.`);
  if (content.includes("\0")) throw new Error(`${name}: file is not valid UTF-8 text.`);
  const headers = parseHeader(content);
  const sourceKind = sourceForHeaders(headers);
  if (!sourceKind)
    throw new Error(
      `${name}: columns do not match exactly one supported Aspenware export.`,
    );
  const rows = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  });
  return { sourceKind, name, content, rowCount: rows.length, headers };
}

export function validateAspenwareImportFiles(
  files: Array<{ name: string; content: string }>,
) {
  if (files.length === 0) throw new Error("Select at least the listing export.");
  if (files.length > MAX_IMPORT_FILE_COUNT)
    throw new Error("At most three Aspenware CSV exports may be imported.");
  const validated = files.map((file) => validateAspenwareCsv(file.name, file.content));
  const sources = new Set(validated.map((file) => file.sourceKind));
  if (sources.size !== validated.length)
    throw new Error("Only one file may be uploaded for each Aspenware source.");
  if (!sources.has("listing"))
    throw new Error("Customer product listing is required.");
  return validated;
}
