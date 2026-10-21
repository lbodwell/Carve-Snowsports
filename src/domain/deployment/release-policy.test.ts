import { describe, expect, it } from "vitest";
import {
  assertMigrationHistory,
  assertReleaseDeployment,
  assertReleaseFiles,
  isReleasePromoted,
  readStagedDeployment,
  verifiedDeploymentOrigin,
  verifiedMigrationTarget,
} from "./release-policy";

const target = {
  projectId: "project",
  orgId: "team",
  scope: "school",
  projectName: "carve",
  repoOwner: "school",
  repoName: "carve",
  branch: "main",
};
const sha = "a".repeat(40);
const origin = "https://carve-build-school.vercel.app";
const deployment = {
  projectId: "project",
  ownerId: "team",
  target: "production",
  readyState: "READY",
  url: new URL(origin).hostname,
  meta: { githubCommitSha: sha },
};

describe("production release boundaries", () => {
  it("reads the explicit noninteractive JSON envelope rather than human CLI output", () => {
    const output = {
      status: "ok",
      deployment: { id: "dpl_test", url: origin },
    };
    expect(readStagedDeployment(output)).toEqual({
      id: "dpl_test",
      url: origin,
    });
    for (const value of [
      `Production: ${origin}\nAliased: https://carve.vercel.app`,
      { ...output, status: "error" },
      { status: "ok", deployment: { id: "dpl_test", url: `${origin}\n` } },
      { status: "ok", deployment: { id: "invalid", url: origin } },
      { status: "ok", deployment: { id: "dpl_test", url: `${origin}/health` } },
    ])
      expect(() => readStagedDeployment(value)).toThrow();
  });
  it("waits for successful aliases and this deployment to become the production target", () => {
    const project = {
      id: target.projectId,
      accountId: target.orgId,
      targets: { production: { id: "dpl_test" } },
      lastAliasRequest: { jobStatus: "succeeded", toDeploymentId: "dpl_test" },
    };
    expect(isReleasePromoted(project, target, "dpl_test")).toBe(true);
    expect(isReleasePromoted(project, target, "dpl_other")).toBe(false);
    expect(
      isReleasePromoted(
        { ...project, targets: { production: { id: "dpl_old" } } },
        target,
        "dpl_test",
      ),
    ).toBe(false);
    expect(
      isReleasePromoted(
        {
          ...project,
          lastAliasRequest: {
            jobStatus: "pending",
            toDeploymentId: "dpl_test",
          },
        },
        target,
        "dpl_test",
      ),
    ).toBe(false);
    expect(() =>
      isReleasePromoted(
        {
          ...project,
          lastAliasRequest: { jobStatus: "failed", toDeploymentId: "dpl_test" },
        },
        target,
        "dpl_test",
      ),
    ).toThrow();
    expect(() =>
      isReleasePromoted({ ...project, id: "other" }, target, "dpl_test"),
    ).toThrow();
  });
  it("keeps application imports while excluding local data and credentials from uploads", () => {
    const appFiles = [
      { path: "vercel.json" },
      { path: "src/server/env.server.ts" },
      { path: "src/domain/imports/aspenware-registration.ts" },
      { path: ".env.example" },
    ];
    expect(() => assertReleaseFiles(appFiles)).not.toThrow();
    for (const path of [
      ".env.local",
      "nested/.env.production",
      ".local-imports/batch/listing.csv",
      "imports/registrations.csv",
      ".workflow-data/runs/run.json",
      ".tmp/diagnostics.json",
      "test-results/auth/session.json",
      "server.log",
      "../private.json",
    ])
      expect(() => assertReleaseFiles([...appFiles, { path }])).toThrow();
  });
  it("refuses empty or incomplete source uploads", () => {
    expect(() => assertReleaseFiles([])).toThrow();
    expect(() => assertReleaseFiles([{ path: "vercel.json" }])).toThrow();
  });
  it("rejects alternate origins, credentials, paths, and lookalike Vercel domains", () => {
    expect(verifiedDeploymentOrigin(origin)).toBe(origin);
    for (const value of [
      "http://carve.vercel.app",
      `${origin}/health`,
      `${origin}?token=secret`,
      "https://carve.vercel.app.attacker.test",
      "https://user:pass@carve.vercel.app",
    ])
      expect(() => verifiedDeploymentOrigin(value)).toThrow();
  });
  it("requires the staged build to match every deployment identity field", () => {
    expect(() =>
      assertReleaseDeployment(deployment, target, sha, origin),
    ).not.toThrow();
    for (const altered of [
      { projectId: "other" },
      { ownerId: "other" },
      { target: "preview" },
      { readyState: "ERROR" },
      { meta: { githubCommitSha: "b".repeat(40) } },
      { url: "other.vercel.app" },
    ])
      expect(() =>
        assertReleaseDeployment(
          { ...deployment, ...altered },
          target,
          sha,
          origin,
        ),
      ).toThrow();
  });
  it("requires immutable applied migration history and refuses older releases", () => {
    const committed = [
      { folderMillis: 1, hash: "first" },
      { folderMillis: 2, hash: "second" },
    ];
    expect(() =>
      assertMigrationHistory(committed, [{ created_at: "1", hash: "first" }]),
    ).not.toThrow();
    expect(() =>
      assertMigrationHistory(committed, [
        { created_at: "1", hash: "modified" },
      ]),
    ).toThrow();
    expect(() =>
      assertMigrationHistory(
        committed.slice(0, 1),
        committed.map((row) => ({
          created_at: row.folderMillis,
          hash: row.hash,
        })),
      ),
    ).toThrow();
    expect(() =>
      assertMigrationHistory([...committed].reverse(), []),
    ).toThrow();
  });
  it("refuses wrong hosts, pooled URLs, missing declarations, and unsafe test targets", () => {
    const env = {
      RELEASE_ENVIRONMENT: "production",
      DATABASE_URL_UNPOOLED:
        "postgresql://user:secret@ep-school.neon.tech/neondb",
      RELEASE_DATABASE_HOST: "ep-school.neon.tech",
      RELEASE_DATABASE_NAME: "neondb",
    };
    expect(verifiedMigrationTarget(env).environment).toBe("production");
    for (const altered of [
      { RELEASE_DATABASE_HOST: "other.neon.tech" },
      { RELEASE_DATABASE_NAME: "other" },
      { RELEASE_ENVIRONMENT: "" },
      {
        DATABASE_URL_UNPOOLED:
          "postgresql://user:secret@ep-school-pooler.neon.tech/neondb",
        RELEASE_DATABASE_HOST: "ep-school-pooler.neon.tech",
      },
      { RELEASE_ENVIRONMENT: "test" },
      {
        DATABASE_URL_UNPOOLED: "postgresql://localhost/carve",
        RELEASE_DATABASE_HOST: "localhost",
        RELEASE_DATABASE_NAME: "carve",
      },
    ])
      expect(() => verifiedMigrationTarget({ ...env, ...altered })).toThrow();
  });
});
