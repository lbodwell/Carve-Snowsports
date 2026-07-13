import { describe, expect, it } from "vitest";

import { summarizeAuditEvent } from "@/application/services/audit-history-service.server";

describe("summarizeAuditEvent", () => {
  it("describes student registration with program context", () => {
    expect(
      summarizeAuditEvent({
        action: "roster.student_registered",
        metadata: { program: "Weekend Snowsports" },
      }),
    ).toBe("Student registered for Weekend Snowsports");
  });

  it("describes instructor updates with discipline keys", () => {
    expect(
      summarizeAuditEvent({
        action: "roster.instructor_updated",
        metadata: { disciplineKeys: ["ski", "snowboard"] },
      }),
    ).toBe("Instructor updated; disciplines: ski, snowboard");
  });
});
