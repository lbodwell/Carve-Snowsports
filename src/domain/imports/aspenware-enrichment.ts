import type { CsvRecord } from "./aspenware-registration";

const normalized = (value = "") =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
const amount = (value = "") => Math.abs(Number(value.replace(/[$,()\s]/g, "")));

export function importBirthdate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const result = `${match[3]}-${match[1]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  const date = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === result &&
    date.getTime() <= Date.now()
    ? result
    : null;
}

/** Resolve report-specific identity columns before the common prompt parser runs. */
export function normalizePromptIdentities(
  prompts: Array<CsvRecord>,
  listing: Array<CsvRecord>,
  birthdates: Array<CsvRecord> = [],
) {
  const issues: Array<string> = [];
  const records = prompts.flatMap((row, index) => {
    if (row.TransactionLineIPCode?.trim()) return [row];
    const name = normalized(
      `${row.ProductHeaderCode ?? ""}, ${row.Textbox2 ?? ""}`,
    );
    const candidates = listing.filter(
      (item) =>
        normalized(item.CustomerName) === name &&
        normalized(item.Product) === normalized(row.ProductHeaderDescription) &&
        item["Product Date"] === row.ProductDate &&
        amount(item["Net Amount"]) === amount(row.TotalPrice) &&
        Number(item.Qty) > 0,
    );
    const evidence = new Set(
      birthdates
        .filter(
          (item) =>
            item.Transactionid === row.TransactionID &&
            normalized(`${item.LastName}, ${item.FirstName}`) === name,
        )
        .map((item) => item.IPCode?.trim()),
    );
    const matched = candidates.filter(
      (item) => !evidence.size || evidence.has(item.DetailRowC0?.trim()),
    );
    if (
      matched.length !== 1 ||
      evidence.size > 1 ||
      (birthdates.length > 0 && evidence.size !== 1)
    ) {
      issues.push(
        `Prompt row ${index + 2}: ${matched.length ? "ambiguous" : "unmatched"} child registration; review transaction, child, product, date and price.`,
      );
      return [];
    }
    return [{ ...row, TransactionLineIPCode: matched[0]!.DetailRowC0! }];
  });
  return { records, issues };
}

export function collectImportBirthdates(records: Array<CsvRecord>) {
  const values = new Map<string, Set<string>>();
  const issues: Array<string> = [];
  for (const [index, row] of records.entries()) {
    const id = row.IPCode?.trim();
    const date = importBirthdate(row.BirthDate ?? "");
    if (!id || !date) {
      issues.push(`Birthdate row ${index + 2}: invalid child ID or birthdate.`);
      continue;
    }
    const dates = values.get(id) ?? new Set<string>();
    dates.add(date);
    values.set(id, dates);
  }
  const dates = new Map<string, string>();
  for (const [id, candidates] of values) {
    if (candidates.size === 1) dates.set(id, [...candidates][0]!);
    else
      issues.push(
        "Birthdate export contains conflicting dates for a child ID; review the source records.",
      );
  }
  return { dates, issues };
}
