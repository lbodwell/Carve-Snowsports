import { describe, expect, it } from "vitest";

import { ApplicationError } from "@/application/errors";
import { requireDeliverableEmail } from "@/server/mail/transport.server";

describe("requireDeliverableEmail", () => {
  it("allows development console delivery when Resend is unset", () => {
    expect(() => requireDeliverableEmail("development", false)).not.toThrow();
  });

  it("fails closed in production when Resend is unset", () => {
    expect(() => requireDeliverableEmail("production", false)).toThrow(
      ApplicationError,
    );
    expect(() => requireDeliverableEmail("production", false)).toThrow(
      /RESEND_API_KEY and EMAIL_FROM/,
    );
  });

  it("allows production delivery when Resend is configured", () => {
    expect(() => requireDeliverableEmail("production", true)).not.toThrow();
  });
});
