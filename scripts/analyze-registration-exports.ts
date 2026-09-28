import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";

import { analyzeAspenwareExports } from "../src/domain/imports/aspenware-registration";
import type { CsvRecord } from "../src/domain/imports/aspenware-registration";

const root = resolve(import.meta.dir, "..");
const importsDirectory = resolve(
  root,
  process.argv[2] === "--imports-dir" && process.argv[3]
    ? process.argv[3]
    : "imports",
);
const outputDirectory = resolve(root, "out", "import-analysis");

const listingFile = "CustomerProductListing.csv";
const byOrderFile = "CustomerProductListingByOrderCustomer.csv";
const promptsFile =
  "ProductSalesDetailWithPrompts-WithCustomerandChildRegByProductDate.csv";

type RawRow = Record<string, string>;

async function readReport(fileName: string): Promise<Array<RawRow>> {
  const content = await readFile(resolve(importsDirectory, fileName), "utf8");
  const rows = parse(content, {
    bom: true,
    columns: true,
    relax_column_count: false,
    skip_empty_lines: true,
    trim: false,
  });
  if (rows.length === 0) throw new Error(`${fileName}: report has no rows.`);
  return rows as Array<RawRow>;
}

function remapListing(row: RawRow): CsvRecord {
  return {
    DetailRowC0: row.DetailRowC0 ?? "",
    Product: row.DetailRowC4 ?? "",
    "Product Date": row.DetailRowC2 ?? "",
    Qty: row.DetailRowC3 ?? "",
    "Net Amount": row.DetailRowC5 ?? "",
    "Transaction Type / Reservation Status": row.DetailRowC6 ?? "",
  };
}

function remapPrompt(row: RawRow): CsvRecord {
  return {
    TransactionID: row.TransactionID ?? "",
    TransactionLineIPCode: row.TransactionLineIPCode ?? "",
    PromptName1: row.PromptName1 ?? "",
    PromptData1: row.PromptData1 ?? "",
    ProductDate: row.ProductDate ?? "",
    CustomerAge: row.CustomerAge ?? "",
    ProductHeaderDescription: row.ProductHeaderDescription ?? "",
    TotalPrice: row.TotalPrice ?? "",
  };
}

function csvCell(value: string | number) {
  const string = String(value);
  return /[,"\r\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

function toCsv(rows: Array<Record<string, string | number>>) {
  const headers = Object.keys(rows[0] ?? {});
  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header] ?? "")).join(","),
    ),
  ].join("\n");
}

function totals(
  rows: Array<{
    grossSales: number;
    returns: number;
    netRegistrations: number;
  }>,
) {
  return rows.reduce(
    (total, row) => ({
      grossSales: total.grossSales + row.grossSales,
      returns: total.returns + row.returns,
      netRegistrations: total.netRegistrations + row.netRegistrations,
    }),
    { grossSales: 0, returns: 0, netRegistrations: 0 },
  );
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizedPrice(value: string) {
  return value.replace(/[$,()\s]/g, "");
}

function diagnostics(
  listingRows: Array<RawRow>,
  byOrderRows: Array<RawRow>,
  promptRows: Array<RawRow>,
  analysis: ReturnType<typeof analyzeAspenwareExports>,
) {
  const listingKeys = new Set(
    listingRows.map((row) =>
      [
        normalized(row.CustomerName ?? ""),
        normalized(row.DetailRowC4 ?? ""),
        row.DetailRowC2 ?? "",
        normalizedPrice(row.DetailRowC5 ?? ""),
      ].join("|"),
    ),
  );
  const promptKeys = new Set(
    promptRows
      .filter((row) => row.PromptName1 === "Ability Level")
      .map((row) =>
        [
          normalized(`${row.ProductHeaderCode ?? ""}, ${row.Textbox2 ?? ""}`),
          normalized(row.ProductHeaderDescription ?? ""),
          row.ProductDate ?? "",
          normalizedPrice(row.TotalPrice ?? ""),
        ].join("|"),
      ),
  );
  const matchedPromptSales = [...promptKeys].filter((key) =>
    listingKeys.has(key),
  ).length;
  const missing = (rows: Array<RawRow>, field: string) =>
    rows.filter((row) => !(row[field] ?? "").trim()).length;
  const unmappedTokens = new Set(
    analysis.listingRegistrations.flatMap(
      (registration) => registration.dimensions.unmappedTokens,
    ),
  );
  const ageBandMismatches = analysis.promptRegistrations.filter(
    (registration) => {
      const [minimum = Number.NaN, maximum = Number.NaN] = (
        registration.dimensions.ageBand ?? ""
      )
        .replace("yrs", "")
        .split("-")
        .map(Number);
      return (
        registration.age !== null &&
        Number.isFinite(minimum) &&
        Number.isFinite(maximum) &&
        (registration.age < minimum || registration.age > maximum)
      );
    },
  ).length;
  const netRegistrations = analysis.listingRegistrations.reduce(
    (total, registration) => total + registration.quantity,
    0,
  );
  const missingPromptLevels =
    analysis.levelCounts.find((row) => row.level === "Unknown")
      ?.registrations ?? 0;
  const activeWithoutPrompt = netRegistrations - matchedPromptSales;
  return [
    `Listing and purchaser-context reports each contain ${listingRows.length} sale/return facts.`,
    `${matchedPromptSales} of ${promptKeys.size} registrations reconstructed from paired prompt rows match a listing sale by normalized child name, product, date, and price.`,
    `Missing email values: child listing ${missing(listingRows, "textbox7")}; purchaser listing ${missing(byOrderRows, "textbox7")}; prompt detail ${missing(promptRows, "ProductHeaderCode2")}.`,
    `The source-provided age falls outside the age range encoded in the purchased product for ${ageBandMismatches} registrations.`,
    `Unmapped product tokens (text the product parser could not classify): ${[...unmappedTokens].join(", ") || "none"}.`,
    `Level unavailable means no matching prompt record exists; ${activeWithoutPrompt} active registrations are in this category.`,
    `Unknown means a matching prompt record exists but its Ability Level response is blank or unusable; ${missingPromptLevels} active registrations are in this category.`,
  ];
}

type CapacityCount = {
  discipline: string;
  weekday: string;
  ageBand: string;
  session: string;
  level: string;
  registrations: number;
};

type MissingPromptRegistration = {
  studentName: string;
  discipline: string;
  weekday: string;
  ageBand: string;
  session: string;
};

function sourceMatchKey(
  participantName: string,
  product: string,
  productDate: string,
  price: string,
) {
  return [
    normalized(participantName),
    normalized(product),
    productDate,
    normalizedPrice(price),
  ].join("|");
}

function promptLevelByListingIndex(
  listingRows: Array<RawRow>,
  promptRows: Array<RawRow>,
  analysis: ReturnType<typeof analyzeAspenwareExports>,
): Map<number, string> {
  const activeListingByKey = new Map<number, string>();
  for (const [index, row] of listingRows.entries()) {
    const registration = analysis.listingRegistrations[index];
    if (!registration || registration.quantity <= 0) continue;
    activeListingByKey.set(
      index,
      sourceMatchKey(
        row.CustomerName ?? "",
        row.DetailRowC4 ?? "",
        row.DetailRowC2 ?? "",
        row.DetailRowC5 ?? "",
      ),
    );
  }
  const listingIndexByKey = new Map(
    [...activeListingByKey.entries()].map(([index, key]) => [key, index]),
  );
  const levels = new Map<number, string>();
  for (const row of promptRows) {
    if (row.PromptName1 !== "Ability Level") continue;
    const listingIndex = listingIndexByKey.get(
      sourceMatchKey(
        `${row.ProductHeaderCode ?? ""}, ${row.Textbox2 ?? ""}`,
        row.ProductHeaderDescription ?? "",
        row.ProductDate ?? "",
        row.TotalPrice ?? "",
      ),
    );
    if (listingIndex === undefined) continue;
    const level =
      row.PromptData1 && /^Level [1-9]\d*$/.test(row.PromptData1)
        ? row.PromptData1
        : "Unknown";
    levels.set(listingIndex, level);
  }
  return levels;
}

function aggregateCapacityCounts(
  analysis: ReturnType<typeof analyzeAspenwareExports>,
  promptLevels: Map<number, string>,
): Array<CapacityCount> {
  const returnedSaleIndexes = new Set(
    analysis.returnPairs.map((pair) => pair.saleRowNumber - 2),
  );
  const groups = new Map<string, CapacityCount>();
  for (const [
    listingIndex,
    listing,
  ] of analysis.listingRegistrations.entries()) {
    if (listing.quantity <= 0 || returnedSaleIndexes.has(listingIndex))
      continue;
    const aggregate: CapacityCount = {
      discipline: listing.dimensions.discipline ?? "Unmapped",
      weekday: listing.dimensions.weekday ?? "Unmapped",
      ageBand: listing.dimensions.ageBand ?? "Unmapped",
      session: listing.dimensions.session ?? "Unmapped",
      level: promptLevels.get(listingIndex) ?? "Level unavailable",
      registrations: 0,
    };
    const key = Object.values(aggregate).slice(0, -1).join("|");
    const existing = groups.get(key) ?? aggregate;
    existing.registrations += listing.quantity;
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) =>
    [a.level, a.weekday, a.session, a.discipline, a.ageBand]
      .join("|")
      .localeCompare(
        [b.level, b.weekday, b.session, b.discipline, b.ageBand].join("|"),
        undefined,
        { numeric: true },
      ),
  );
}

function missingPromptRegistrations(
  listingRows: Array<RawRow>,
  analysis: ReturnType<typeof analyzeAspenwareExports>,
  promptLevels: Map<number, string>,
): Array<MissingPromptRegistration> {
  const returnedSaleIndexes = new Set(
    analysis.returnPairs.map((pair) => pair.saleRowNumber - 2),
  );
  return analysis.listingRegistrations.flatMap((listing, index) => {
    if (
      listing.quantity <= 0 ||
      promptLevels.has(index) ||
      returnedSaleIndexes.has(index)
    )
      return [];
    return [
      {
        studentName: listingRows[index]?.CustomerName ?? "",
        discipline: listing.dimensions.discipline ?? "Unmapped",
        weekday: listing.dimensions.weekday ?? "Unmapped",
        ageBand: listing.dimensions.ageBand ?? "Unmapped",
        session: listing.dimensions.session ?? "Unmapped",
      },
    ];
  });
}

function htmlDocument(data: {
  capacityCounts: Array<CapacityCount>;
  warnings: Array<string>;
  diagnostics: Array<string>;
}) {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Registration Export Analysis — 2026/27</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
    body { max-width: 1200px; margin: 0 auto; padding: 2rem; line-height: 1.45; }
    h1, h2, h3 { color: #101828; font-weight: 650; letter-spacing: -.01em; }
    h1 { margin: 0 0 .25rem; font-size: 1.75rem; } h2 { margin: 0 0 .25rem; font-size: 1.2rem; } h3 { margin: 1.25rem 0 .2rem; font-size: 1rem; }
    .muted, .section-subtitle { color: #475467; } .section-subtitle { margin: 0 0 .75rem; font-size: .925rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .metric, section { border: 1px solid #d0d5dd; border-radius: .6rem; padding: 1rem; }
    .metric strong { display: block; font-size: 2rem; } section { margin-top: 1rem; }
    label { display: inline-block; margin: .5rem 1rem .5rem 0; } select { margin-left: .35rem; padding: .3rem; }
    table { width: 100%; border-collapse: collapse; margin-top: .75rem; } th, td { border-bottom: 1px solid #d0d5dd; padding: .5rem; text-align: left; }
    .sort-button { appearance: none; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; font-weight: 650; padding: 0; } .sort-button:hover { text-decoration: underline; } .sort-indicator { display: inline-block; min-width: 1em; }
    .warning { color: #b42318; }
    @media (prefers-color-scheme: dark) { h1, h2, h3 { color: #f2f4f7; } .muted, .section-subtitle { color: #d0d5dd; } }
  </style>
</head>
<body>
  <h1>Registration Export Analysis</h1>
  <p class="muted">2026/27 Aspenware exports · aggregate-only report · generated locally</p>
  <div class="summary" id="summary"></div>
  <section>
    <h2>Capacity planning snapshot</h2>
    <p id="cohort-note">Enrollment demand is net of returns.</p>
    <div id="filters"></div><div id="sessions"></div>
  </section>
  <section>
    <h2>Reconciliation notes</h2><ul id="notes"></ul>
  </section>
  <script>
    const data = ${json};
    const unique = (name) => [...new Set(data.capacityCounts.map(row => row[name]))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const filters = ["discipline", "weekday", "ageBand", "session", "level"];
    const choices = Object.fromEntries(filters.map(name => [name, "All"]));
    const columns = [
      ["discipline", "Discipline"],
      ["weekday", "Day"],
      ["ageBand", "Age band"],
      ["session", "Session"],
      ["level", "Level"],
      ["registrations", "Registrations"]
    ];
    const sortState = { key: null, direction: "ascending" };
    const filterContainer = document.querySelector("#filters");
    filters.forEach(name => {
      const label = document.createElement("label");
      label.textContent = name.replace(/([A-Z])/g, " $1") + ":";
      const select = document.createElement("select");
      const values = unique(name);
      select.innerHTML = ["All", ...values].map(value => '<option>' + value + '</option>').join("");
      select.addEventListener("change", () => { choices[name] = select.value; renderSessions(); });
      label.append(select); filterContainer.append(label);
    });
    function renderSessions() {
      const filteredRows = data.capacityCounts.filter(row => filters.every(name => choices[name] === "All" || row[name] === choices[name]));
      const rows = [...filteredRows];
      if (sortState.key) {
        rows.sort((a, b) => {
          const left = a[sortState.key];
          const right = b[sortState.key];
          const comparison = typeof left === "number"
            ? left - right
            : String(left).localeCompare(String(right), undefined, { numeric: true });
          return sortState.direction === "ascending" ? comparison : -comparison;
        });
      }
      const max = Math.max(1, ...rows.map(row => row.registrations));
      const body = rows.map(row => '<tr><td>' + row.discipline + '</td><td>' + row.weekday + '</td><td>' + row.ageBand + '</td><td>' + row.session + '</td><td>' + row.level + '</td><td>' + row.registrations + '</td></tr>').join("");
      const totalRegistrations = rows.reduce((total, row) => total + row.registrations, 0);
      const recurringSessions = new Set(rows.map(row => row.weekday + "|" + row.session)).size;
      document.querySelector("#summary").innerHTML = [
        ["Filtered registrations", totalRegistrations],
        ["Recurring day/session combinations", recurringSessions],
        ["Largest selected group demand", max]
      ].map(([label, value]) => '<div class="metric"><span>' + label + '</span><strong>' + value + '</strong></div>').join("");
      const headers = columns.map(([key, label]) => {
        const active = sortState.key === key;
        const indicator = active ? (sortState.direction === "ascending" ? "▲" : "▼") : "";
        const ariaSort = active ? sortState.direction : "none";
        return '<th aria-sort="' + ariaSort + '"><button class="sort-button" data-sort-key="' + key + '">' + label + ' <span class="sort-indicator" aria-hidden="true">' + indicator + '</span></button></th>';
      }).join("");
      document.querySelector("#sessions").innerHTML = '<table><thead><tr>' + headers + '</tr></thead><tbody>' + body + '</tbody></table>';
      document.querySelectorAll("[data-sort-key]").forEach(button => button.addEventListener("click", () => {
        const key = button.dataset.sortKey;
        if (sortState.key === key) {
          sortState.direction = sortState.direction === "ascending" ? "descending" : "ascending";
        } else {
          sortState.key = key;
          sortState.direction = key === "registrations" ? "descending" : "ascending";
        }
        renderSessions();
      }));
    }
    document.querySelector("#notes").innerHTML = [...data.diagnostics, ...(data.warnings.length ? data.warnings : ["No structural warnings: expected prompt-row pairs and unambiguous return-to-sale matches were found."])].map(note => '<li class="' + (note.includes("warning") ? "warning" : "") + '">' + note + '</li>').join("");
    renderSessions();
  </script>
</body></html>`;
}

async function main() {
  const [listingRows, byOrderRows, promptRows] = await Promise.all([
    readReport(listingFile),
    readReport(byOrderFile),
    readReport(promptsFile),
  ]);
  const analysis = analyzeAspenwareExports(
    listingRows.map(remapListing),
    promptRows.map(remapPrompt),
  );
  const summary = totals(analysis.sessionCounts);
  const promptLevels = promptLevelByListingIndex(
    listingRows,
    promptRows,
    analysis,
  );
  const capacityCounts = aggregateCapacityCounts(analysis, promptLevels);
  const capacityTotal = capacityCounts.reduce(
    (total, row) => total + row.registrations,
    0,
  );
  const missingPrompts = missingPromptRegistrations(
    listingRows,
    analysis,
    promptLevels,
  );
  const diagnosticNotes = diagnostics(
    listingRows,
    byOrderRows,
    promptRows,
    analysis,
  );
  const sourceFacts = {
    listingRows: listingRows.length,
    byOrderRows: byOrderRows.length,
    promptRows: promptRows.length,
    promptRegistrations: analysis.promptRegistrations.length,
    pairedReturns: analysis.returnPairs.length,
  };
  const expectedFacts = {
    listingRows: 476,
    byOrderRows: 476,
    promptRows: 756,
    promptRegistrations: 378,
    pairedReturns: 11,
    netRegistrations: 454,
    capacityTotal: 454,
  };
  const actualFacts = {
    ...sourceFacts,
    netRegistrations: summary.netRegistrations,
    capacityTotal,
  };
  const failed = Object.entries(expectedFacts).filter(
    ([key, expected]) =>
      actualFacts[key as keyof typeof actualFacts] !== expected,
  );
  if (failed.length)
    throw new Error(
      `Unexpected export structure: ${failed.map(([key, value]) => `${key}=${value}`).join(", ")}`,
    );

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(resolve(outputDirectory, "restricted"), { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "capacity_counts.csv"),
      toCsv(capacityCounts),
    ),
    writeFile(
      resolve(
        outputDirectory,
        "restricted",
        "missing_prompt_registrations.csv",
      ),
      toCsv(missingPrompts),
    ),
    writeFile(
      resolve(outputDirectory, "reconciliation.json"),
      `${JSON.stringify(
        {
          summary,
          sourceFacts,
          diagnostics: diagnosticNotes,
          warnings: analysis.warnings,
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      resolve(outputDirectory, "report.html"),
      htmlDocument({
        capacityCounts,
        warnings: analysis.warnings,
        diagnostics: diagnosticNotes,
      }),
    ),
  ]);
  console.info(`Wrote privacy-safe analysis to ${outputDirectory}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
