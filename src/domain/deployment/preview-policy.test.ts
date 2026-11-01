import { afterEach, describe, expect, it, vi } from "vitest";
import target from "../../../config/preview-database.json";
import {
  waitForMigrationHistory,
  waitForPreviewSchema,
} from "../../../scripts/wait-preview-schema";
import { assertMigrationHistory } from "./release-policy";
import { previewSchemaState, verifiedPreviewDatabase } from "./preview-policy";

const committed = [
  { hash: "first", folderMillis: 1 },
  { hash: "second", folderMillis: 2 },
];
const applied = [
  { hash: "first", created_at: 1 },
  { hash: "second", created_at: "2" },
];
afterEach(() => vi.useRealTimers());

describe("Preview schema readiness", () => {
  it("distinguishes an unmigrated database, pending migrations and readiness", () => {
    expect(previewSchemaState(committed, [])).toBe("pending");
    expect(previewSchemaState(committed, applied.slice(0, 1))).toBe("pending");
    expect(previewSchemaState(committed, applied)).toBe("ready");
  });
  it("allows newer shared Preview history without weakening production history checks", () => {
    const newer = [...applied, { hash: "third", created_at: 3 }];
    expect(previewSchemaState(committed, newer)).toBe("ready");
    expect(() => assertMigrationHistory(committed, newer)).toThrow();
    expect(() =>
      previewSchemaState(committed, [{ hash: "edited", created_at: 1 }]),
    ).toThrow(/conflicts/);
    expect(() =>
      previewSchemaState(committed, [{ hash: "first", created_at: 99 }]),
    ).toThrow(/conflicts/);
  });
  it("only accepts the existing isolated Preview database, pooled or direct", () => {
    for (const host of [target.host, target.host.replace(".", "-pooler.")]) {
      const url = `postgresql://test:secret@${host}/${target.database}`;
      expect(verifiedPreviewDatabase(url)).toBe(url);
    }
    for (const url of [
      undefined,
      "invalid-secret",
      `postgresql://test:secret@${target.host}/wrong`,
      "postgresql://test:secret@production.neon.tech/neondb",
      "postgresql://test:secret@localhost/carve_test",
    ])
      expect(() => verifiedPreviewDatabase(url)).toThrow();
  });
  it("waits for pending migrations and recovers from temporary connection failures", async () => {
    vi.useFakeTimers();
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("private driver details"))
      .mockResolvedValueOnce(applied.slice(0, 1))
      .mockResolvedValue(applied);
    const waiting = waitForMigrationHistory({
      committed,
      readApplied: read,
      pollMs: 100,
      timeoutMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(200);
    await expect(waiting).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("fails clearly on timeout instead of publishing against an incomplete schema", async () => {
    vi.useFakeTimers();
    const result = expect(
      waitForMigrationHistory({
        committed,
        readApplied: () => Promise.resolve([]),
        pollMs: 100,
        timeoutMs: 200,
      }),
    ).rejects.toThrow(/Preview schema is not ready/);
    await vi.advanceTimersByTimeAsync(200);
    await result;
  });
  it("fails immediately for conflicting history and leaves non-Preview builds alone", async () => {
    const read = vi
      .fn()
      .mockResolvedValue([{ hash: "conflict", created_at: 1 }]);
    await expect(
      waitForMigrationHistory({ committed, readApplied: read }),
    ).rejects.toThrow(/conflicts/);
    expect(read).toHaveBeenCalledTimes(1);
    await expect(
      waitForPreviewSchema({ VERCEL_ENV: "production" }),
    ).resolves.toBeUndefined();
    await expect(waitForPreviewSchema({})).resolves.toBeUndefined();
  });
});
