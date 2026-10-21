import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareImportUpload,
  queueStoredImport,
} from "./import-upload-service.server";
import { adminActor } from "@/test/factories/actors";

const mocks = vi.hoisted(() => ({
  token: vi.fn().mockResolvedValue("scoped-client-token"),
  read: vi.fn(),
  remove: vi.fn().mockResolvedValue(undefined),
  queue: vi
    .fn()
    .mockResolvedValue({ batchId: "synthetic-batch", status: "queued" }),
}));
vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: mocks.token,
}));
vi.mock("@/application/ports/import-storage.server", () => ({
  getImportObjectBytes: mocks.read,
  deleteImportObject: mocks.remove,
}));
vi.mock("@/application/services/registration-import-service.server", () => ({
  queueRegistrationImport: mocks.queue,
  queueRegistrationImportZip: mocks.queue,
}));
vi.mock("@/db/client.server", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve([{ id: "program" }]),
        }),
      }),
    }),
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const programId = "11111111-1111-4111-8111-111111111111";
describe("private import upload transport", () => {
  it("issues a short-lived token for one actor-owned file with a 10 MB ceiling", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
    const upload = await prepareImportUpload(adminActor, {
      programId,
      name: "listing.csv",
      size: 50,
    });
    expect(upload?.key).toMatch(
      new RegExp(
        `^pending-imports/${adminActor.organizationId}/${adminActor.userId}/[0-9a-f-]+\\.csv$`,
      ),
    );
    expect(mocks.token).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: upload!.key,
        maximumSizeInBytes: 10 * 1024 * 1024,
        allowedContentTypes: ["text/csv"],
        allowOverwrite: false,
        addRandomSuffix: false,
      }),
    );
  });
  it("refuses deployment uploads when private client upload credentials are missing", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    await expect(
      prepareImportUpload(adminActor, {
        programId,
        name: "listing.csv",
        size: 50,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("never reads another actor's uploaded object", async () => {
    await expect(
      queueStoredImport(adminActor, {
        programId,
        files: [
          {
            name: "listing.csv",
            size: 50,
            key: `pending-imports/${adminActor.organizationId}/someone-else/${programId}.csv`,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("validates the server-side bytes and detects the listing from its headers", async () => {
    const bytes = Buffer.from(
      "DetailRowC0,CustomerName,textbox10,DetailRowC1,DetailRowC2,DetailRowC3,DetailRowC4,DetailRowC5,DetailRowC6\n1,Student,9,1/1/27,1/9/27,1,Product,$1,Sale",
    );
    mocks.read.mockResolvedValue(bytes);
    const key = `pending-imports/${adminActor.organizationId}/${adminActor.userId}/${programId}.csv`;
    await expect(
      queueStoredImport(adminActor, {
        programId,
        files: [{ name: "export.csv", size: bytes.length, key }],
      }),
    ).resolves.toMatchObject({ status: "queued" });
    expect(mocks.queue).toHaveBeenCalledWith(
      adminActor,
      expect.objectContaining({
        programId,
        listingCsv: bytes.toString("utf8"),
      }),
    );
    expect(mocks.remove).toHaveBeenCalledWith(key);
    await expect(
      queueStoredImport(adminActor, {
        programId,
        files: [{ name: "export.csv", size: bytes.length + 1, key }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
