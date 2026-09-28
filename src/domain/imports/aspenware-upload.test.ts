import { describe, expect, it } from "vitest";

import {
  validateAspenwareImportFiles,
} from "@/domain/imports/aspenware-upload";

const listingHeader = [
  "DetailRowC0",
  "CustomerName",
  "textbox10",
  "DetailRowC1",
  "DetailRowC2",
  "DetailRowC3",
  "DetailRowC4",
  "DetailRowC5",
  "DetailRowC6",
].join(",");

describe("Aspenware upload validation", () => {
  it("detects the required listing by its headers", () => {
    expect(
      validateAspenwareImportFiles([
        { name: "anything.csv", content: `${listingHeader}\n1,Student,6,1/1/26,1/2/26,1,Product,$1,Sale` },
      ]),
    ).toMatchObject([{ sourceKind: "listing", rowCount: 1 }]);
  });

  it("rejects a batch without the authoritative listing", () => {
    expect(() =>
      validateAspenwareImportFiles([
        { name: "other.csv", content: "TransactionID,TransactionLineIPCode,ProductDate,ProductHeaderDescription,PromptName1,PromptData1,TotalPrice\n1,2,1/1/27,Product,Ability Level,Level 1,$1" },
      ]),
    ).toThrow("Customer product listing is required");
  });

  it("rejects duplicate roles without trusting filenames", () => {
    expect(() =>
      validateAspenwareImportFiles([
        { name: "first.csv", content: listingHeader },
        { name: "second.csv", content: listingHeader },
      ]),
    ).toThrow("Only one file");
  });
});
