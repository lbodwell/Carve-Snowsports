import { describe, expect, it } from "vitest";
import {
  collectImportBirthdates,
  importBirthdate,
  normalizePromptIdentities,
} from "./aspenware-enrichment";

const listing = {
  DetailRowC0: "child-1",
  CustomerName: "Example, Casey",
  Product: "Ski",
  "Product Date": "1/9/2027",
  "Net Amount": "$100",
  Qty: "1",
};
const prompt = {
  ProductHeaderCode: "Example",
  Textbox2: "Casey",
  ProductHeaderDescription: "Ski",
  ProductDate: "1/9/2027",
  TotalPrice: "100.00",
  TransactionID: "sale-1",
};
describe("customer-name report normalization", () => {
  it("resolves a unique matching registration without a DoB file", () => {
    expect(
      normalizePromptIdentities([prompt], [listing]).records[0]
        ?.TransactionLineIPCode,
    ).toBe("child-1");
  });
  it("refuses duplicate purchases rather than borrowing identity", () => {
    const result = normalizePromptIdentities([prompt], [listing, listing]);
    expect(result.records).toHaveLength(0);
    expect(result.issues).toHaveLength(1);
  });
  it("requires DoB transaction evidence to agree with the listing", () => {
    const result = normalizePromptIdentities(
      [prompt],
      [listing],
      [
        {
          IPCode: "other-child",
          FirstName: "Casey",
          LastName: "Example",
          Transactionid: "sale-1",
        },
      ],
    );
    expect(result.records).toHaveLength(0);
  });
  it("preserves explicit legacy IDs", () => {
    expect(
      normalizePromptIdentities(
        [{ ...prompt, TransactionLineIPCode: "legacy" }],
        [],
      ).records[0]?.TransactionLineIPCode,
    ).toBe("legacy");
  });
});
describe("birthdate enrichment", () => {
  it("parses calendar dates and rejects rolled-over dates", () => {
    expect(importBirthdate("2/29/2020")).toBe("2020-02-29");
    expect(importBirthdate("2/29/2019")).toBeNull();
  });
  it("deduplicates agreeing values and excludes conflicts", () => {
    const result = collectImportBirthdates([
      { IPCode: "one", BirthDate: "1/2/2020" },
      { IPCode: "one", BirthDate: "1/3/2020" },
      { IPCode: "two", BirthDate: "1/2/2020" },
    ]);
    expect(result.dates.has("one")).toBe(false);
    expect(result.dates.get("two")).toBe("2020-01-02");
    expect(result.issues).toHaveLength(1);
  });
});
