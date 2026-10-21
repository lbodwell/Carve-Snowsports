import { describe, expect, it } from "vitest";

import type { CsvRecord } from "@/domain/imports/aspenware-registration";
import {
  analyzeAspenwareExports,
  parseProductDimensions,
  previewAspenwareRegistrationBatch,
} from "@/domain/imports/aspenware-registration";

function listing(overrides: Partial<CsvRecord> = {}): CsvRecord {
  return {
    DetailRowC0: "child-opaque-1",
    CustomerName: "Example, Avery",
    DetailRowC1: "3/12/2026",
    Product:
      "PM | Ski | Children's Seasonal Program | 26/27 | Saturday | 4-6yrs | 10am",
    "Product Date": "1/9/2027",
    Qty: "1",
    "Net Amount": "$719.00",
    "Transaction Type / Reservation Status": "Type:Sale; Status:Open",
    ...overrides,
  };
}

function byOrder(overrides: Partial<CsvRecord> = {}): CsvRecord {
  return {
    DetailRowC0: "purchaser-opaque-1",
    CustomerName: "Example, Taylor",
    LineCustomerName: "Example, Avery",
    DetailRowC1: "3/12/2026",
    DetailRowC2: "1/9/2027",
    DetailRowC3: "1",
    DetailRowC4: listing().Product!,
    DetailRowC5: "$719.00",
    DetailRowC6: "Type:Sale; Status:Open",
    textbox7: "taylor@example.test",
    PhoneNumber: "",
    ...overrides,
  };
}

function prompt(
  transactionId: string,
  lineId: string,
  promptName: string,
  response: string,
): CsvRecord {
  return {
    TransactionID: transactionId,
    TransactionLineIPCode: lineId,
    PromptName1: promptName,
    PromptData1: response,
    ProductDate: "1/9/2027",
    CustomerAge: "5",
    ProductHeaderDescription:
      "PM | Ski | Children's Seasonal Program | 26/27 | Saturday | 4-6yrs | 10am",
    TotalPrice: "$719.00",
  };
}

describe("Aspenware registration export analysis", () => {
  it("enriches canonical listing prices using child IDs for prompts and names for purchasers", () => {
    // Production remapping exposes Net Amount, not the raw DetailRowC5 field.
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: [listing()],
      byOrderRecords: [byOrder()],
      promptRecords: [
        prompt("order-1", "child-opaque-1", "Ability Level", "Level 3"),
      ],
    });
    expect(preview.issues).toEqual([]);
    expect(preview.summary).toMatchObject({
      promptMatched: 1,
      byOrderMatched: 1,
    });
    expect(preview.facts[0]).toMatchObject({
      participantKey: "child-opaque-1",
      abilityLevel: "Level 3",
      purchaser: {
        externalId: "purchaser-opaque-1",
        email: "taylor@example.test",
      },
      issues: [],
    });
  });

  it("treats by-order sales and refunds as separate facts regardless of order", () => {
    const refund = byOrder({
      DetailRowC3: "-1",
      DetailRowC5: "($719.00)",
      DetailRowC6: "Type:Return; Status:Open",
    });
    for (const rows of [
      [byOrder(), refund],
      [refund, byOrder()],
    ]) {
      const preview = previewAspenwareRegistrationBatch({
        listingRecords: [listing()],
        byOrderRecords: rows,
      });
      expect(preview.issues).toEqual([]);
      expect(preview.summary.byOrderMatched).toBe(1);
      expect(preview.facts[0]?.status).toBe("active");
    }
  });

  it("blocks conflicting purchaser matches without choosing the first", () => {
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: [listing()],
      byOrderRecords: [
        byOrder(),
        byOrder({ DetailRowC0: "different-purchaser" }),
      ],
    });
    expect(preview.issues).toEqual([
      expect.stringContaining("purchaser match is ambiguous"),
    ]);
    expect(preview.facts[0]?.purchaser).toBeNull();
  });

  it("does not assign one name-based purchaser match to distinct child IDs", () => {
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: [
        listing(),
        listing({ DetailRowC0: "other-child-with-same-name" }),
      ],
      byOrderRecords: [byOrder()],
    });
    expect(preview.issues).toHaveLength(2);
    expect(preview.facts.every((fact) => fact.purchaser === null)).toBe(true);
  });

  it("uses the sale date to disambiguate repeat purchases and accepts equivalent purchaser context", () => {
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: [listing()],
      byOrderRecords: [
        byOrder({ DetailRowC1: "4/1/2026", DetailRowC0: "other-purchaser" }),
        byOrder(),
        byOrder(),
      ],
    });
    expect(preview.issues).toEqual([]);
    expect(preview.facts[0]?.purchaser?.externalId).toBe("purchaser-opaque-1");
  });

  it("does not borrow prompt information from another child or a different price", () => {
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: [listing()],
      promptRecords: [
        prompt("order-1", "other-child", "Ability Level", "Level 5"),
        {
          ...prompt("order-2", "child-opaque-1", "Ability Level", "Level 4"),
          TotalPrice: "$819.00",
        },
      ],
    });
    expect(preview.summary.promptMatched).toBe(0);
    expect(preview.facts[0]?.abilityLevel).toBeNull();
  });

  it("distinguishes a blank answer from an absent prompt without blocking enrollment", () => {
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: [listing()],
      promptRecords: [prompt("order-1", "child-opaque-1", "Ability Level", "")],
    });
    expect(preview.issues).toEqual([]);
    expect(preview.summary.promptMatched).toBe(1);
    expect(preview.facts[0]?.issues).toContain(
      "Ability level answer is blank or unusable.",
    );
  });

  it("parses weekend and weekday product token orders", () => {
    expect(
      parseProductDimensions(
        "PM | SB | Children's Seasonal Program | 26/27 | Saturday | 7-12yrs | 1pm",
      ),
    ).toMatchObject({
      sourcePrefix: "PM",
      discipline: "Snowboard",
      season: "26/27",
      weekday: "Saturday",
      ageBand: "7-12yrs",
      session: "1pm",
    });
    expect(
      parseProductDimensions(
        "PM | Ski | Children's Seasonal Program | 26/27 | 2-5yrs | Thursday | Session 1",
      ),
    ).toMatchObject({
      weekday: "Thursday",
      ageBand: "2-5yrs",
      session: "Session 1",
    });
  });

  it("collapses prompt rows by transaction and line, not line alone", () => {
    const result = analyzeAspenwareExports(
      [listing()],
      [
        prompt("transaction-1", "shared-line", "Ability Level", "Level 2"),
        prompt("transaction-1", "shared-line", "Lesson Comment", ""),
        prompt("transaction-2", "shared-line", "Ability Level", "Level 4"),
        prompt("transaction-2", "shared-line", "Lesson Comment", ""),
      ],
    );

    expect(result.promptRegistrations).toHaveLength(2);
    expect(result.levelCounts).toEqual([
      { level: "Level 2", registrations: 1 },
      { level: "Level 4", registrations: 1 },
    ]);
  });

  it("pairs a return to one sale and computes net counts", () => {
    const result = analyzeAspenwareExports(
      [
        listing(),
        listing({
          DetailRowC0: "child-opaque-2",
          Qty: "-1",
          "Transaction Type / Reservation Status": "Type:Return; Status:Closed",
        }),
        listing({
          DetailRowC0: "child-opaque-2",
          Qty: "1",
          "Transaction Type / Reservation Status": "Type:Sale; Status:Open",
        }),
      ],
      [],
    );

    expect(result.returnPairs).toEqual([
      { returnRowNumber: 3, saleRowNumber: 4 },
    ]);
    expect(result.sessionCounts).toEqual([
      expect.objectContaining({
        grossSales: 2,
        returns: 1,
        netRegistrations: 1,
      }),
    ]);
  });

  it("uses the listing as the required enrollment source", () => {
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: [listing()],
    });

    expect(preview.summary).toMatchObject({
      grossSales: 1,
      returns: 0,
      active: 1,
      promptMatched: 0,
      byOrderMatched: 0,
    });
    expect(preview.facts[0]).toMatchObject({
      participantKey: "child-opaque-1",
      status: "active",
      abilityLevel: null,
      purchaser: null,
    });
  });

  it("does not merge two prompt products for one child and transaction", () => {
    const result = analyzeAspenwareExports(
      [listing()],
      [
        prompt("transaction-1", "shared-line", "Ability Level", "Level 2"),
        prompt("transaction-1", "shared-line", "Lesson Comment", ""),
        {
          ...prompt("transaction-1", "shared-line", "Ability Level", "Level 4"),
          ProductHeaderDescription:
            "PM | Ski | Children's Seasonal Program | 26/27 | Saturday | 7-12yrs | 10am",
          TotalPrice: "$819.00",
        },
        {
          ...prompt("transaction-1", "shared-line", "Lesson Comment", ""),
          ProductHeaderDescription:
            "PM | Ski | Children's Seasonal Program | 26/27 | Saturday | 7-12yrs | 10am",
          TotalPrice: "$819.00",
        },
      ],
    );

    expect(result.promptRegistrations).toHaveLength(2);
  });

  it("rejects missing required listing headers", () => {
    expect(() =>
      previewAspenwareRegistrationBatch({
        listingRecords: [{ DetailRowC0: "only-a-column" }],
      }),
    ).toThrow("Listing: missing required columns");
  });

  it("keeps a paired return as one returned sale fact", () => {
    const preview = previewAspenwareRegistrationBatch({
      listingRecords: [
        listing(),
        listing({
          Qty: "-1",
          "Transaction Type / Reservation Status": "Type:Return; Status:Open",
        }),
      ],
    });

    expect(preview.facts).toHaveLength(1);
    expect(preview.summary).toMatchObject({ active: 0, returned: 1 });
    expect(preview.facts[0]?.status).toBe("returned");
  });
});
