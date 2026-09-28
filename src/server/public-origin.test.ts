import { describe, expect, it } from "vitest";

import { normalizeOrigin, resolvePublicOrigin } from "@/server/public-origin";

describe("normalizeOrigin", () => {
  it("adds https to bare Vercel hosts and strips a trailing slash", () => {
    expect(normalizeOrigin("carve-abc.vercel.app/")).toBe(
      "https://carve-abc.vercel.app",
    );
  });

  it("preserves an explicit protocol", () => {
    expect(normalizeOrigin("http://127.0.0.1:3001")).toBe(
      "http://127.0.0.1:3001",
    );
  });
});

describe("resolvePublicOrigin", () => {
  it("uses configured production origins and also trusts the Vercel host", () => {
    const resolved = resolvePublicOrigin({
      APP_ORIGIN: "https://carve.example.com",
      BETTER_AUTH_URL: "https://carve.example.com",
      VERCEL_ENV: "production",
      VERCEL_URL: "carve-prod.vercel.app",
    });

    expect(resolved.appOrigin).toBe("https://carve.example.com");
    expect(resolved.authUrl).toBe("https://carve.example.com");
    expect(resolved.trustedOrigins).toContain("https://carve.example.com");
    expect(resolved.trustedOrigins).toContain("https://carve-prod.vercel.app");
  });

  it("overrides preview deployments to the unique Vercel URL", () => {
    const resolved = resolvePublicOrigin({
      APP_ORIGIN: "https://carve.example.com",
      BETTER_AUTH_URL: "https://carve.example.com",
      VERCEL_ENV: "preview",
      VERCEL_URL: "carve-git-beta-team.vercel.app",
      VERCEL_BRANCH_URL: "carve-git-beta-team.vercel.app",
    });

    expect(resolved.appOrigin).toBe("https://carve-git-beta-team.vercel.app");
    expect(resolved.authUrl).toBe("https://carve-git-beta-team.vercel.app");
    expect(resolved.trustedOrigins).toContain("https://carve.example.com");
    expect(resolved.trustedOrigins).toContain(
      "https://carve-git-beta-team.vercel.app",
    );
  });

  it("requires APP_ORIGIN when no Vercel preview host is available", () => {
    expect(() =>
      resolvePublicOrigin({
        BETTER_AUTH_URL: "https://carve.example.com",
      }),
    ).toThrow("APP_ORIGIN is required.");
  });
});
