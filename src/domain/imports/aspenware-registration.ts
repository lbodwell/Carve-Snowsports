export type CsvRecord = Record<string, string>;

export const ASPENWARE_ADAPTER_VERSION = "2026-27@1";

export const aspenwareListingHeaders = [
  "DetailRowC0",
  "Product",
  "Product Date",
  "Qty",
  "Net Amount",
  "Transaction Type / Reservation Status",
] as const;
export const aspenwareByOrderHeaders = [
  "DetailRowC0",
  "LineCustomerName",
  "DetailRowC1",
  "DetailRowC2",
  "DetailRowC3",
  "DetailRowC4",
  "DetailRowC5",
  "DetailRowC6",
] as const;
export const aspenwarePromptHeaders = [
  "TransactionID",
  "TransactionLineIPCode",
  "ProductDate",
  "ProductHeaderDescription",
  "PromptName1",
  "PromptData1",
  "TotalPrice",
] as const;

export type AspenwareBatchInput = {
  listingRecords: Array<CsvRecord>;
  byOrderRecords?: Array<CsvRecord>;
  promptRecords?: Array<CsvRecord>;
};

export type AspenwareImportFact = {
  sourceKey: string;
  rowNumber: number;
  participantKey: string;
  studentName: string;
  product: string;
  productDate: string;
  saleDate: string;
  priceCents: number;
  quantity: number;
  status: "active" | "returned";
  dimensions: ProductDimensions;
  sourceAge: number | null;
  abilityLevel: string | null;
  purchaser: {
    externalId: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  issues: Array<string>;
};

export type AspenwareBatchPreview = {
  facts: Array<AspenwareImportFact>;
  sourceCounts: {
    listing: number;
    byOrder: number | null;
    prompts: number | null;
  };
  summary: {
    grossSales: number;
    returns: number;
    active: number;
    returned: number;
    promptMatched: number;
    byOrderMatched: number;
  };
  issues: Array<string>;
};

export type ListingRegistration = {
  rowNumber: number;
  participantKey: string;
  product: string;
  productDate: string;
  priceCents: number;
  quantity: number;
  status: "sale" | "return";
  dimensions: ProductDimensions;
};

export type PromptRegistration = {
  rowNumbers: Array<number>;
  transactionId: string;
  lineId: string;
  participantKey: string;
  product: string;
  productDate: string;
  priceCents: number;
  age: number | null;
  abilityLevel: string | null;
  dimensions: ProductDimensions;
  issues: Array<string>;
};

export type ProductDimensions = {
  sourcePrefix: string | null;
  discipline: "Ski" | "Snowboard" | null;
  program: string | null;
  season: string | null;
  weekday: string | null;
  ageBand: string | null;
  session: string | null;
  unmappedTokens: Array<string>;
};

export type ReturnPair = {
  returnRowNumber: number;
  saleRowNumber: number;
};

export type AggregateRow = {
  discipline: string;
  weekday: string;
  ageBand: string;
  session: string;
  grossSales: number;
  returns: number;
  netRegistrations: number;
};

export type ImportAnalysis = {
  listingRegistrations: Array<ListingRegistration>;
  promptRegistrations: Array<PromptRegistration>;
  returnPairs: Array<ReturnPair>;
  sessionCounts: Array<AggregateRow>;
  levelCounts: Array<{ level: string; registrations: number }>;
  warnings: Array<string>;
};

const weekdays = new Set(["Thursday", "Friday", "Saturday", "Sunday"]);
const sessionTokens = new Set([
  "9am",
  "10am",
  "1pm",
  "Full Day",
  "Session 1",
  "Session 2",
]);
const ageBandPattern = /^\d+-\d+yrs$/;
const levelPattern = /^Level [1-9]\d*$/;

function cell(record: CsvRecord, column: string) {
  return record[column]?.trim() ?? "";
}

function required(record: CsvRecord, column: string, rowNumber: number) {
  const result = cell(record, column);
  if (!result) throw new Error(`Row ${rowNumber}: ${column} is required.`);
  return result;
}

function parseCurrency(rawValue: string, rowNumber: number) {
  const negative = /^\s*\(/.test(rawValue);
  const numericText = rawValue.replace(/[$,()\s]/g, "");
  const parsed = Number.parseFloat(numericText);
  const amount = negative ? -parsed : parsed;
  if (!Number.isFinite(amount))
    throw new Error(`Row ${rowNumber}: invalid currency value.`);
  return Math.round(amount * 100);
}

function parseQuantity(rawValue: string, rowNumber: number) {
  const quantity = Number.parseFloat(rawValue);
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity))
    throw new Error(`Row ${rowNumber}: quantity must be an integer.`);
  return quantity;
}

function parseAge(rawValue: string) {
  if (!rawValue) return null;
  const age = Number.parseInt(rawValue, 10);
  return Number.isInteger(age) && age >= 0 ? age : null;
}

function parseOptionalAge(rawValue: string) {
  const age = parseAge(rawValue);
  return age !== null && age <= 30 ? age : null;
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizedPrice(value: string) {
  return value.replace(/[$,()\s]/g, "");
}

function requireHeaders(
  records: Array<CsvRecord>,
  headers: ReadonlyArray<string>,
  source: string,
) {
  const available = new Set(Object.keys(records[0] ?? {}));
  const missing = headers.filter((header) => !available.has(header));
  if (missing.length > 0)
    throw new Error(`${source}: missing required columns: ${missing.join(", ")}.`);
}

export function parseProductDimensions(product: string): ProductDimensions {
  const tokens = product
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
  const dimensions: ProductDimensions = {
    sourcePrefix: null,
    discipline: null,
    program: null,
    season: null,
    weekday: null,
    ageBand: null,
    session: null,
    unmappedTokens: [],
  };

  for (const token of tokens) {
    if (token === "PM" && !dimensions.sourcePrefix) {
      dimensions.sourcePrefix = token;
    } else if (token === "Ski") {
      dimensions.discipline = "Ski";
    } else if (token === "SB") {
      dimensions.discipline = "Snowboard";
    } else if (/^\d{2}\/\d{2}$/.test(token)) {
      dimensions.season = token;
    } else if (weekdays.has(token)) {
      dimensions.weekday = token;
    } else if (ageBandPattern.test(token)) {
      dimensions.ageBand = token;
    } else if (sessionTokens.has(token)) {
      dimensions.session = token;
    } else if (token.includes("Program")) {
      dimensions.program = token;
    } else {
      dimensions.unmappedTokens.push(token);
    }
  }
  return dimensions;
}

export function parseCustomerProductListing(
  records: Array<CsvRecord>,
): Array<ListingRegistration> {
  return records.map((record, index) => {
    const rowNumber = index + 2;
    const quantity = parseQuantity(
      required(record, "Qty", rowNumber),
      rowNumber,
    );
    const statusText = required(
      record,
      "Transaction Type / Reservation Status",
      rowNumber,
    );
    const status =
      quantity < 0 || statusText.includes("Return") ? "return" : "sale";

    return {
      rowNumber,
      participantKey: required(record, "DetailRowC0", rowNumber),
      product: required(record, "Product", rowNumber),
      productDate: required(record, "Product Date", rowNumber),
      priceCents: Math.abs(
        parseCurrency(required(record, "Net Amount", rowNumber), rowNumber),
      ),
      quantity,
      status,
      dimensions: parseProductDimensions(
        required(record, "Product", rowNumber),
      ),
    };
  });
}

export function parsePromptRegistrations(
  records: Array<CsvRecord>,
): Array<PromptRegistration> {
  const grouped = new Map<string, PromptRegistration>();

  for (const [index, record] of records.entries()) {
    const rowNumber = index + 2;
    const transactionId = required(record, "TransactionID", rowNumber);
    const lineId = required(record, "TransactionLineIPCode", rowNumber);
    const product = required(record, "ProductHeaderDescription", rowNumber);
    const productDate = required(record, "ProductDate", rowNumber);
    const priceCents = Math.abs(
      parseCurrency(required(record, "TotalPrice", rowNumber), rowNumber),
    );
    const key = [
      transactionId,
      lineId,
      normalized(product),
      productDate,
      priceCents,
    ].join(":");
    const promptName = required(record, "PromptName1", rowNumber);
    const response = cell(record, "PromptData1");
    const existing = grouped.get(key);

    if (existing) {
      if (
        existing.product !== product ||
        existing.productDate !== productDate ||
        existing.priceCents !== priceCents
      ) {
        existing.issues.push("Prompt rows disagree on sale details.");
      }
      existing.rowNumbers.push(rowNumber);
      if (promptName === "Ability Level") {
        if (existing.abilityLevel && existing.abilityLevel !== response)
          existing.issues.push("Multiple ability-level answers.");
        existing.abilityLevel = levelPattern.test(response) ? response : null;
      }
      continue;
    }

    grouped.set(key, {
      rowNumbers: [rowNumber],
      transactionId,
      lineId,
      participantKey: required(record, "TransactionLineIPCode", rowNumber),
      product,
      productDate,
      priceCents,
      age: parseAge(cell(record, "CustomerAge")),
      abilityLevel:
        promptName === "Ability Level" && levelPattern.test(response)
          ? response
          : null,
      dimensions: parseProductDimensions(product),
      issues: [],
    });
  }

  return [...grouped.values()].map((registration) => {
    return registration;
  });
}

function returnMatchKey(registration: ListingRegistration) {
  return [
    registration.participantKey,
    registration.product.trim().toLowerCase(),
    registration.productDate,
    registration.priceCents,
  ].join("|");
}

export function pairReturns(listings: Array<ListingRegistration>): {
  pairs: Array<ReturnPair>;
  warnings: Array<string>;
} {
  const availableSales = new Map<string, Array<ListingRegistration>>();
  for (const listing of listings) {
    if (listing.status !== "sale" || listing.quantity <= 0) continue;
    const key = returnMatchKey(listing);
    availableSales.set(key, [...(availableSales.get(key) ?? []), listing]);
  }

  const pairs: Array<ReturnPair> = [];
  const warnings: Array<string> = [];
  for (const registration of listings) {
    if (registration.status !== "return" || registration.quantity >= 0)
      continue;
    const key = returnMatchKey(registration);
    const candidates = availableSales.get(key) ?? [];
    if (candidates.length !== 1) {
      warnings.push(
        `Return row ${registration.rowNumber} has ${candidates.length} sale matches.`,
      );
      continue;
    }
    const sale = candidates[0];
    if (!sale) continue;
    pairs.push({
      returnRowNumber: registration.rowNumber,
      saleRowNumber: sale.rowNumber,
    });
    availableSales.delete(key);
  }
  return { pairs, warnings };
}

function label(dimension: string | null) {
  return dimension ?? "Unmapped";
}

export function aggregateSessionCounts(
  listings: Array<ListingRegistration>,
): Array<AggregateRow> {
  const groups = new Map<string, AggregateRow>();
  for (const listing of listings) {
    const row = {
      discipline: label(listing.dimensions.discipline),
      weekday: label(listing.dimensions.weekday),
      ageBand: label(listing.dimensions.ageBand),
      session: label(listing.dimensions.session),
    };
    const key = Object.values(row).join("|");
    const aggregate = groups.get(key) ?? {
      ...row,
      grossSales: 0,
      returns: 0,
      netRegistrations: 0,
    };
    if (listing.quantity > 0) aggregate.grossSales += listing.quantity;
    if (listing.quantity < 0) aggregate.returns += Math.abs(listing.quantity);
    aggregate.netRegistrations += listing.quantity;
    groups.set(key, aggregate);
  }
  return [...groups.values()].sort((a, b) =>
    [a.weekday, a.session, a.discipline, a.ageBand]
      .join("|")
      .localeCompare([b.weekday, b.session, b.discipline, b.ageBand].join("|")),
  );
}

export function analyzeAspenwareExports(
  listingRecords: Array<CsvRecord>,
  promptRecords: Array<CsvRecord>,
): ImportAnalysis {
  const listingRegistrations = parseCustomerProductListing(listingRecords);
  const promptRegistrations = parsePromptRegistrations(promptRecords);
  const pairedReturns = pairReturns(listingRegistrations);
  const levelCounts = new Map<string, number>();
  for (const registration of promptRegistrations) {
    const level = registration.abilityLevel ?? "Unknown";
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
  }

  const warnings = [
    ...pairedReturns.warnings,
    ...promptRegistrations.flatMap((registration) =>
      registration.issues.map(
        (issue) =>
          `Prompt registration ${registration.rowNumbers.join("/")} ${issue}`,
      ),
    ),
  ];
  return {
    listingRegistrations,
    promptRegistrations,
    returnPairs: pairedReturns.pairs,
    sessionCounts: aggregateSessionCounts(listingRegistrations),
    levelCounts: [...levelCounts.entries()]
      .map(([level, registrations]) => ({ level, registrations }))
      .sort((a, b) =>
        a.level.localeCompare(b.level, undefined, { numeric: true }),
      ),
    warnings,
  };
}

function listingMatchKey(
  participantKey: string,
  product: string,
  productDate: string,
  price: string,
) {
  return [
    normalized(participantKey),
    normalized(product),
    productDate,
    normalizedPrice(price),
  ].join("|");
}

/**
 * Produces canonical registration facts from the required child-level listing.
 * Optional exports may enrich only those facts and never create enrollment.
 */
export function previewAspenwareRegistrationBatch(
  input: AspenwareBatchInput,
): AspenwareBatchPreview {
  requireHeaders(input.listingRecords, aspenwareListingHeaders, "Listing");
  if (input.byOrderRecords)
    requireHeaders(input.byOrderRecords, aspenwareByOrderHeaders, "By-order");
  if (input.promptRecords)
    requireHeaders(input.promptRecords, aspenwarePromptHeaders, "Prompt");

  const analysis = analyzeAspenwareExports(input.listingRecords, []);
  const returnedSaleIndexes = new Set(
    analysis.returnPairs.map((pair) => pair.saleRowNumber - 2),
  );
  const issues = [...analysis.warnings];
  const byOrderByKey = new Map<string, CsvRecord>();
  if (input.byOrderRecords) {
    for (const row of input.byOrderRecords) {
      const key = listingMatchKey(
        cell(row, "LineCustomerName"),
        cell(row, "DetailRowC4"),
        cell(row, "DetailRowC2"),
        cell(row, "DetailRowC5"),
      );
      if (byOrderByKey.has(key)) {
        issues.push(`By-order export has duplicate reconciliation key ${key}.`);
      } else byOrderByKey.set(key, row);
    }
  }

  const promptByKey = new Map<string, PromptRegistration>();
  if (input.promptRecords) {
    for (const registration of parsePromptRegistrations(input.promptRecords)) {
      const key = listingMatchKey(
        registration.participantKey,
        registration.product,
        registration.productDate,
        cell(
          input.promptRecords[
            Math.max(0, (registration.rowNumbers[0] ?? 2) - 2)
          ] ?? {},
          "TotalPrice",
        ),
      );
      if (promptByKey.has(key)) {
        issues.push(
          `Prompt export has duplicate registration reconciliation key ${key}.`,
        );
      } else promptByKey.set(key, registration);
      issues.push(
        ...registration.issues.map(
          (issue) =>
            `Prompt registration ${registration.rowNumbers.join("/")} ${issue}`,
        ),
      );
    }
  }

  let promptMatched = 0;
  let byOrderMatched = 0;
  const facts = analysis.listingRegistrations.flatMap((listing, index) => {
    if (listing.quantity < 0) return [];
    const sourceRow = input.listingRecords[index] ?? {};
    const key = listingMatchKey(
      listing.participantKey,
      listing.product,
      listing.productDate,
      cell(sourceRow, "DetailRowC5"),
    );
    const byOrder = byOrderByKey.get(key);
    const prompt = promptByKey.get(key);
    if (byOrder) byOrderMatched += 1;
    if (prompt) promptMatched += 1;
    const isReturned =
      listing.quantity < 0 || returnedSaleIndexes.has(index);
    return [{
      sourceKey: [
        listing.participantKey,
        normalized(listing.product),
        listing.productDate,
        cell(sourceRow, "DetailRowC1"),
        listing.priceCents,
      ].join("|"),
      rowNumber: listing.rowNumber,
      participantKey: listing.participantKey,
      studentName: cell(sourceRow, "CustomerName"),
      product: listing.product,
      productDate: listing.productDate,
      saleDate: cell(sourceRow, "DetailRowC1"),
      priceCents: listing.priceCents,
      quantity: listing.quantity,
      status: isReturned ? "returned" : "active",
      dimensions: listing.dimensions,
      sourceAge: parseOptionalAge(cell(sourceRow, "textbox10")),
      abilityLevel: prompt?.abilityLevel ?? null,
      purchaser: byOrder
        ? {
            externalId: cell(byOrder, "DetailRowC0"),
            name: cell(byOrder, "CustomerName"),
            email: cell(byOrder, "textbox7") || null,
            phone: cell(byOrder, "PhoneNumber") || null,
          }
        : null,
      issues: [
        ...(isReturned ? [] : prompt ? [] : ["Ability level unavailable."]),
        ...(isReturned ? [] : byOrder ? [] : ["Purchaser context unavailable."]),
      ],
    } satisfies AspenwareImportFact];
  });
  const grossSales = analysis.listingRegistrations
    .filter((listing) => listing.quantity > 0)
    .reduce((count, listing) => count + listing.quantity, 0);
  const returns = analysis.listingRegistrations
    .filter((listing) => listing.quantity < 0)
    .reduce((count, listing) => count + Math.abs(listing.quantity), 0);
  return {
    facts,
    sourceCounts: {
      listing: input.listingRecords.length,
      byOrder: input.byOrderRecords?.length ?? null,
      prompts: input.promptRecords?.length ?? null,
    },
    summary: {
      grossSales,
      returns,
      active: facts.filter((fact) => fact.status === "active").length,
      returned: facts.filter((fact) => fact.status === "returned").length,
      promptMatched,
      byOrderMatched,
    },
    issues,
  };
}
