import { FileArchive, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StaffEmptyState,
  StaffNotice,
  StaffPageHeader,
  StaffStatusBadge,
  staffCardClassName,
} from "@/features/admin/staff-ui";
import { cn } from "@/lib/utils";
import {
  applyRegistrationImport,
  getRecentRegistrationImports,
  getRegistrationImport,
  prepareRegistrationImportUpload,
  queueRegistrationImport,
  queueRegistrationImportZip,
  queueUploadedRegistrationImport,
  retryFailedRegistrationImport,
  reviewImportIdentity,
} from "@/server/functions/registration-import";

type Program = { id: string; name: string; seasonName: string };
type ImportPreview = {
  batchId: string;
  status: string;
  updatedAt?: string;
  failureCode?: string | null;
  issues?: Array<string>;
  reconciliation: Record<string, number>;
  identityReview?: Array<{
    participantKey: string;
    studentName: string;
    candidates: Array<{
      id: string;
      firstName: string;
      lastName: string;
      dateOfBirth: string | null;
    }>;
    decision?: string;
  }>;
  facts?: Array<{
    rowNumber: number;
    studentName: string;
    status: string;
    discipline: string | null;
    abilityLevel: string | null;
    issues: Array<string>;
  }>;
};
type SelectedFile = { content: string; name: string; file: File };

const reconciliationLabels: Record<string, string> = {
  grossSales: "Registrations sold",
  returns: "Refunds",
  active: "Active registrations",
  returned: "Returned registrations",
  promptMatched: "Ability records matched",
  byOrderMatched: "Purchasers matched",
  issueCount: "Blocking issues",
};

async function textFromFile(file: File | null) {
  return file ? { content: await file.text(), name: file.name, file } : null;
}

async function base64FromFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function canApply(status: string) {
  return status === "ready" || status === "ready_for_review";
}

export function RegistrationImportWorkspace({
  programs,
}: {
  programs: Array<Program>;
}) {
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [listing, setListing] = useState<SelectedFile | null>(null);
  const [byOrder, setByOrder] = useState<SelectedFile | null>(null);
  const [prompts, setPrompts] = useState<SelectedFile | null>(null);
  const [archive, setArchive] = useState<SelectedFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof getRecentRegistrationImports>>
  >([]);
  const selectedProgram = programs.find((program) => program.id === programId);

  useEffect(() => {
    if (!programId) return;
    let active = true;
    void getRecentRegistrationImports({ data: { programId } })
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch(() => {
        if (active)
          setError(
            "Previous imports could not be loaded. You can still upload new files.",
          );
      });
    return () => {
      active = false;
    };
  }, [programId, preview?.status]);

  useEffect(() => {
    if (
      !preview ||
      !["queued", "processing", "applying"].includes(preview.status)
    )
      return;
    let active = true;
    const timer = window.setInterval(() => {
      void getRegistrationImport({ data: { batchId: preview.batchId } })
        .then((next) => {
          if (active) setPreview(next);
        })
        .catch(() => {
          if (active)
            setError(
              "Could not check the import status. Use Refresh status to try again.",
            );
        });
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [preview]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!programId || (!listing && !archive)) return;
    setLoading(true);
    setError(null);
    try {
      const files = archive
        ? [archive]
        : [listing, byOrder, prompts].filter(
            (file): file is SelectedFile => file !== null,
          );
      const first = files[0]!;
      const ticket = await prepareRegistrationImportUpload({
        data: { programId, name: first.name, size: first.file.size },
      });
      if (ticket) {
        const { put } = await import("@vercel/blob/client");
        const uploaded = [];
        for (const [index, selected] of files.entries()) {
          const permission =
            index === 0
              ? ticket
              : await prepareRegistrationImportUpload({
                  data: {
                    programId,
                    name: selected.name,
                    size: selected.file.size,
                  },
                });
          if (!permission)
            throw new Error("Upload configuration changed. Please retry.");
          await put(permission.key, selected.file, {
            access: "private",
            token: permission.token,
            contentType: permission.contentType,
          });
          uploaded.push({
            name: selected.name,
            size: selected.file.size,
            key: permission.key,
          });
        }
        const queued = await queueUploadedRegistrationImport({
          data: { programId, files: uploaded },
        });
        setPreview(
          await getRegistrationImport({ data: { batchId: queued.batchId } }),
        );
        return;
      }
      const queued = archive
        ? await queueRegistrationImportZip({
            data: {
              programId,
              archiveName: archive.name,
              archiveBase64: archive.content,
            },
          })
        : listing
          ? await queueRegistrationImport({
              data: {
                programId,
                listingCsv: listing.content,
                listingName: listing.name,
                byOrderCsv: byOrder?.content,
                byOrderName: byOrder?.name,
                promptCsv: prompts?.content,
                promptName: prompts?.name,
              },
            })
          : null;
      if (!queued) return;
      setPreview(
        await getRegistrationImport({ data: { batchId: queued.batchId } }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not prepare the import.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!preview || !canApply(preview.status)) return;
    setApplying(true);
    setError(null);
    try {
      const result = await applyRegistrationImport({
        data: { batchId: preview.batchId },
      });
      setPreview(
        await getRegistrationImport({ data: { batchId: result.batchId } }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not apply the import.",
      );
    } finally {
      setApplying(false);
    }
  }

  async function review(participantKey: string, studentId: string) {
    if (!preview) return;
    setReviewing(true);
    setError(null);
    try {
      setPreview(
        await reviewImportIdentity({
          data: { batchId: preview.batchId, participantKey, studentId },
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The identity decision could not be saved.",
      );
    } finally {
      setReviewing(false);
    }
  }

  if (programs.length === 0) {
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        <StaffPageHeader
          icon={FileUp}
          title="Registration import"
          description="Upload Aspenware exports to preview and apply roster updates."
        />
        <Card className={staffCardClassName}>
          <CardContent>
            <StaffEmptyState
              title="No programs available"
              description="Create a season and program before importing registrations."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <StaffPageHeader
        icon={FileUp}
        title="Registration import"
        description="Upload the child listing plus any available enrichment exports, or one ZIP containing them. Files are checked before anything is written to the roster."
      />

      {error ? (
        <StaffNotice
          variant="error"
          title="Import could not continue"
          description={error}
        />
      ) : null}

      {history.length > 0 && (
        <label className="grid gap-2 text-sm font-medium">
          Resume a previous import
          <select
            aria-label="Previous imports"
            className="rounded-md border bg-white p-2"
            disabled={loading || applying || reviewing}
            value={preview?.batchId ?? ""}
            onChange={(event) => {
              const batchId = event.target.value;
              if (!batchId) {
                setPreview(null);
                return;
              }
              void getRegistrationImport({ data: { batchId } })
                .then(setPreview)
                .catch(() => setError("This import could not be loaded."));
            }}
          >
            <option value="">Start a new import</option>
            {history.map((batch) => (
              <option key={batch.batchId} value={batch.batchId}>
                {new Date(batch.createdAt).toLocaleString()} ·{" "}
                {batch.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      )}

      <Card className={staffCardClassName}>
        <CardHeader>
          <CardTitle>Choose files</CardTitle>
          <CardDescription>
            Start with a ZIP of the exports, or pick the CSVs individually.
            Click a tile to choose a file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="import-program">Program</Label>
              <Select
                value={programId}
                disabled={loading || applying || reviewing}
                onValueChange={(value) => {
                  setProgramId(value);
                  setPreview(null);
                }}
              >
                <SelectTrigger id="import-program">
                  <SelectValue placeholder="Select a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.seasonName} — {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProgram ? (
                <p className="text-muted-foreground text-sm">
                  Records will be imported into {selectedProgram.name}.
                </p>
              ) : null}
            </div>

            <FilePicker
              accept=".zip,application/zip"
              description="One archive can replace the individual CSV uploads below."
              fileName={archive?.name}
              icon={FileArchive}
              label="Import ZIP"
              onFile={async (file) => {
                setArchive(
                  file
                    ? {
                        name: file.name,
                        content: await base64FromFile(file),
                        file,
                      }
                    : null,
                );
                if (file) {
                  setListing(null);
                  setByOrder(null);
                  setPrompts(null);
                }
              }}
            />

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Or select individual CSVs</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <FilePicker
                  accept=".csv,text/csv"
                  description="Required unless a ZIP is selected."
                  disabled={Boolean(archive)}
                  fileName={listing?.name}
                  icon={FileSpreadsheet}
                  label="Customer product listing"
                  onFile={async (file) => setListing(await textFromFile(file))}
                />
                <FilePicker
                  accept=".csv,text/csv"
                  description="Optional enrichment file."
                  disabled={Boolean(archive)}
                  fileName={byOrder?.name}
                  icon={FileSpreadsheet}
                  label="By-order customer listing"
                  onFile={async (file) => setByOrder(await textFromFile(file))}
                />
                <FilePicker
                  accept=".csv,text/csv"
                  description="Optional prompt answers."
                  disabled={Boolean(archive)}
                  fileName={prompts?.name}
                  icon={FileSpreadsheet}
                  label="Product sales prompts"
                  onFile={async (file) => setPrompts(await textFromFile(file))}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || (!listing && !archive) || !programId}
            >
              {loading ? "Starting import…" : "Validate and begin import"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {preview ? (
        <Card className={staffCardClassName}>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Import status</CardTitle>
              <CardDescription>
                Batch {preview.batchId} is currently{" "}
                {preview.status.replaceAll("_", " ")}.
              </CardDescription>
            </div>
            <StaffStatusBadge status={preview.status} />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(preview.status === "failed" ||
              (["queued", "processing"].includes(preview.status) &&
                preview.updatedAt &&
                Date.now() - new Date(preview.updatedAt).getTime() >
                  10 * 60_000)) && (
              <Button
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    await retryFailedRegistrationImport({
                      data: { batchId: preview.batchId },
                    });
                    setPreview(
                      await getRegistrationImport({
                        data: { batchId: preview.batchId },
                      }),
                    );
                  } catch {
                    setError(
                      "The import could not be retried. Please refresh and try again.",
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Retry processing
              </Button>
            )}
            {preview.issues?.length ? (
              <div
                role="alert"
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
              >
                {preview.issues.map((issue, index) => (
                  <p key={index}>{issue}</p>
                ))}
              </div>
            ) : null}
            {preview.failureCode && (
              <StaffNotice
                variant="error"
                title="The import needs attention"
                description={
                  preview.failureCode === "APPLY_FAILED"
                    ? "The apply transaction was rolled back. Review student identity decisions, refresh status, then try Apply again."
                    : "Import processing failed. Check the source files and retry."
                }
              />
            )}
            <Button
              className="w-fit"
              variant="outline"
              disabled={loading || applying || reviewing}
              onClick={() => {
                void getRegistrationImport({
                  data: { batchId: preview.batchId },
                })
                  .then(setPreview)
                  .catch(() =>
                    setError(
                      "Could not refresh this import. Please try again.",
                    ),
                  );
              }}
            >
              Refresh status
            </Button>
            {preview.status === "applied" && (
              <StaffNotice
                variant="success"
                title="Roster updated"
                description="Existing confirmed survey links were preserved. Exact name and birthdate matches were linked automatically; uncertain responses still need review."
              />
            )}
            {preview.status === "applied" && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link to="/admin/surveys">Review survey matches</Link>
                </Button>
                <Button asChild>
                  <Link to="/grouping" search={{ programId }}>
                    Build lesson groups
                  </Link>
                </Button>
              </div>
            )}
            {preview.identityReview?.length ? (
              <section className="grid gap-3">
                <h3 className="font-semibold">Check existing students</h3>
                <p className="text-muted-foreground text-sm">
                  These imported names resemble students already on your roster.
                  Choose the existing student or explicitly create a separate
                  student.
                </p>
                {preview.identityReview.map((item) => (
                  <label
                    key={item.participantKey}
                    className="grid gap-2 rounded-lg border p-3 text-sm"
                  >
                    <span className="font-medium">{item.studentName}</span>
                    <select
                      aria-label={`Identity for ${item.studentName}`}
                      className="rounded border bg-white p-2"
                      disabled={
                        reviewing || applying || preview.status === "applied"
                      }
                      value={item.decision ?? ""}
                      onChange={(event) =>
                        void review(item.participantKey, event.target.value)
                      }
                    >
                      <option value="" disabled>
                        Choose a student or create a new one
                      </option>
                      {item.candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          Link {candidate.firstName} {candidate.lastName} ·{" "}
                          {candidate.dateOfBirth ?? "Birthdate missing"}
                        </option>
                      ))}
                      <option value="new">Create a separate new student</option>
                    </select>
                  </label>
                ))}
              </section>
            ) : null}
            {preview.status === "needs_review" && (
              <StaffNotice
                variant="error"
                title="Source rows need attention"
                description="Resolve the blocking reconciliation issues listed above, then upload the corrected files. Nothing has been applied."
              />
            )}
            {preview.facts?.some((fact) => fact.issues.length) && (
              <div className="max-h-72 overflow-y-auto rounded-lg border p-3 text-sm">
                <h3 className="mb-2 font-semibold">
                  Optional information missing
                </h3>
                <p className="text-muted-foreground mb-3">
                  These rows can still be imported. Missing ability levels
                  remain unknown; missing purchaser details remain blank.
                  Re-export all reports with matching filters to improve
                  coverage, or complete the information later.
                </p>
                {preview.facts
                  .filter((fact) => fact.issues.length)
                  .map((fact) => (
                    <p key={fact.rowNumber} className="mb-2">
                      Row {fact.rowNumber} · {fact.studentName}:{" "}
                      {fact.issues.join("; ")}
                    </p>
                  ))}
              </div>
            )}
            {Object.keys(preview.reconciliation).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Reconciliation counts appear here when processing finishes.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(preview.reconciliation).map(
                  ([label, value]) => (
                    <div key={label} className="bg-pm-mist rounded-xl p-3">
                      <p className="text-muted-foreground text-xs">
                        {reconciliationLabels[label] ?? label}
                      </p>
                      <p className="text-xl font-semibold">{String(value)}</p>
                    </div>
                  ),
                )}
              </div>
            )}
            {canApply(preview.status) ? (
              <Button
                type="button"
                disabled={
                  applying ||
                  reviewing ||
                  preview.identityReview?.some((item) => !item.decision)
                }
                onClick={apply}
              >
                {applying ? "Applying…" : "Apply import"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FilePicker({
  accept,
  description,
  disabled,
  fileName,
  icon: Icon,
  label,
  onFile,
}: {
  accept: string;
  description: string;
  disabled?: boolean;
  fileName?: string;
  icon: typeof FileSpreadsheet;
  label: string;
  onFile: (file: File | null) => void | Promise<void>;
}) {
  const id = useId();
  const [fileError, setFileError] = useState<string | null>(null);
  async function choose(file: File | null) {
    setFileError(null);
    if (file && file.size > 10 * 1024 * 1024) {
      setFileError("This file exceeds the 10 MB limit.");
      return;
    }
    try {
      await onFile(file);
    } catch {
      setFileError("The file could not be read. Please choose it again.");
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        onDragOver={(event) => {
          if (!disabled) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (!disabled) void choose(event.dataTransfer.files[0] ?? null);
        }}
        className={cn(
          "hover:border-pm-green hover:bg-pm-mist/60 flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center transition-colors",
          fileName && "border-pm-green/40 bg-pm-mist",
          disabled &&
            "hover:border-input pointer-events-none cursor-not-allowed opacity-50 hover:bg-transparent",
        )}
      >
        <input
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = "";
            void choose(file);
          }}
        />
        <span className="bg-pm-mist text-pm-green flex size-10 items-center justify-center rounded-full">
          {fileName ? (
            <Icon className="size-5" aria-hidden="true" />
          ) : (
            <Upload className="size-5" aria-hidden="true" />
          )}
        </span>
        <span className="text-sm font-medium">
          {fileName ?? "Drop a file or click to choose"}
        </span>
        <span className="text-muted-foreground text-xs leading-relaxed">
          {fileName ? "Click to replace this file" : description}
        </span>
      </label>
      {fileName && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={disabled}
          onClick={() => void choose(null)}
        >
          Remove file
        </Button>
      )}
      {fileError && (
        <p role="alert" className="text-destructive text-xs">
          {fileError}
        </p>
      )}
    </div>
  );
}
