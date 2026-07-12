import { describe, expect, it } from "vitest";

import {
  previewSeasonalRegistrationCsv,
  seasonalRegistrationHeaders,
} from "@/domain/imports/seasonal-registration-2025-26";

const headerRow = seasonalRegistrationHeaders.join(",");

describe("previewSeasonalRegistrationCsv", () => {
  it("rejects an unknown file shape without producing mutations", () => {
    const result = previewSeasonalRegistrationCsv(
      "First_Name,Last_Name\nAvery,Chen",
    );

    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.missingHeaders).toContain("Transaction_ID");
  });

  it("normalizes a valid row and retains attendance provenance", () => {
    const cells = seasonalRegistrationHeaders.map((header) => {
      if (header === "First_Name") return "Avery";
      if (header === "Last_Name") return "Chen";
      if (header === "Transaction_ID") return "tx-123";
      if (header === "Medication") return "Inhaler";
      if (header === "Jan_3") return "P";
      return "";
    });
    const result = previewSeasonalRegistrationCsv(
      `${headerRow}\n${cells.join(",")}`,
    );

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.rows[0]).toMatchObject({
        rowNumber: 2,
        transactionId: "tx-123",
        studentName: "Avery Chen",
        attendance: [{ sourceColumn: "Jan_3", rawValue: "P" }],
        supportCategories: ["medication"],
      });
    }
  });
});
