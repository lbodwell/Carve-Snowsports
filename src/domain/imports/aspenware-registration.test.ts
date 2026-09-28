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
    Product:
      "PM | Ski | Children's Seasonal Program | 26/27 | Saturday | 4-6yrs | 10am",
    "Product Date": "1/9/2027",
    Qty: "1",
    "Net Amount": "$719.00",
    "Transaction Type / Reservation Status": "Type:Sale; Status:Open",
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
