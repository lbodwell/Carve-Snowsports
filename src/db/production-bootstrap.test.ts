import { describe, expect, it } from "vitest";

import { readProductionBootstrapConfig } from "@/db/production-bootstrap";

const validEnv = {
  BOOTSTRAP_ORGANIZATION_NAME: "Pleasant Mountain Snowsports",
  BOOTSTRAP_ADMIN_EMAIL: "ops@pleasantmountain.com",
  BOOTSTRAP_ADMIN_PASSWORD: "a-sufficiently-long-password",
};

describe("readProductionBootstrapConfig", () => {
  it("accepts a production-safe bootstrap when confirmed", () => {
    const config = readProductionBootstrapConfig({
      ...validEnv,
      NODE_ENV: "production",
      CONFIRM_PRODUCTION_BOOTSTRAP: "yes",
    });

    expect(config.organizationName).toBe("Pleasant Mountain Snowsports");
    expect(config.timezone).toBe("America/New_York");
    expect(config.surveySlug).toBe("pre-lesson");
  });

  it("refuses an unconfirmed production run", () => {
    expect(() =>
      readProductionBootstrapConfig({
        ...validEnv,
        NODE_ENV: "production",
      }),
    ).toThrow(/CONFIRM_PRODUCTION_BOOTSTRAP=yes/);
  });

  it("refuses the demo organization and local admin identity", () => {
    expect(() =>
      readProductionBootstrapConfig({
        BOOTSTRAP_ORGANIZATION_NAME: "Carve Demo Ski School",
        BOOTSTRAP_ADMIN_EMAIL: "admin@carve.local",
        BOOTSTRAP_ADMIN_PASSWORD: "carve-local-admin",
      }),
    ).toThrow(/demo organization|real staff email|unique production password/);
  });
});
