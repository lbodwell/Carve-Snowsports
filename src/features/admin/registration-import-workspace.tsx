import { FileArchive, FileSpreadsheet, FileUp, Upload } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

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
  getRegistrationImport,
  queueRegistrationImport,
  queueRegistrationImportZip,
} from "@/server/functions/registration-import";

type Program = { id: string; name: string; seasonName: string };
type ImportPreview = {
  batchId: string;
  status: string;
  reconciliation: Record<string, number>;
};
type SelectedFile = { content: string; name: string };

async function textFromFile(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0];
  return file ? { content: await file.text(), name: file.name } : null;
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
  const selectedProgram = programs.find((program) => program.id === programId);

  useEffect(() => {
    if (!preview || !["queued", "processing"].includes(preview.status)) return;
    const timer = window.setInterval(() => {
      void getRegistrationImport({ data: { batchId: preview.batchId } }).then(
        (next) =>
          setPreview({
            batchId: next.batchId,
            status: next.status,
            reconciliation: next.reconciliation,
          }),
      );
    }, 2000);
    return () => window.clearInterval(timer);
  }, [preview]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!programId || (!listing && !archive)) return;
    setLoading(true);
    setError(null);
    try {
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
      setPreview({
        batchId: queued.batchId,
        status: queued.status,
        reconciliation: {},
      });
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
      setPreview({
        ...preview,
        status: result.applied ? "applied" : preview.status,
      });
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
              <Select value={programId} onValueChange={setProgramId}>
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
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                setArchive(
                  file
                    ? { name: file.name, content: await base64FromFile(file) }
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
                  onChange={async (event) =>
                    setListing(await textFromFile(event))
                  }
                />
                <FilePicker
                  accept=".csv,text/csv"
                  description="Optional enrichment file."
                  disabled={Boolean(archive)}
                  fileName={byOrder?.name}
                  icon={FileSpreadsheet}
                  label="By-order customer listing"
                  onChange={async (event) =>
                    setByOrder(await textFromFile(event))
                  }
                />
                <FilePicker
                  accept=".csv,text/csv"
                  description="Optional prompt answers."
                  disabled={Boolean(archive)}
                  fileName={prompts?.name}
                  icon={FileSpreadsheet}
                  label="Product sales prompts"
                  onChange={async (event) =>
                    setPrompts(await textFromFile(event))
                  }
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
            {Object.keys(preview.reconciliation).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Reconciliation counts appear here when processing finishes.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(preview.reconciliation).map(
                  ([label, value]) => (
                    <div key={label} className="bg-pm-mist rounded-xl p-3">
                      <p className="text-muted-foreground text-xs">{label}</p>
                      <p className="text-xl font-semibold">{String(value)}</p>
                    </div>
                  ),
                )}
              </div>
            )}
            {canApply(preview.status) ? (
              <Button type="button" disabled={applying} onClick={apply}>
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
  onChange,
}: {
  accept: string;
  description: string;
  disabled?: boolean;
  fileName?: string;
  icon: typeof FileSpreadsheet;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
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
          onChange={onChange}
        />
        <span className="bg-pm-mist text-pm-green flex size-10 items-center justify-center rounded-full">
          {fileName ? (
            <Icon className="size-5" aria-hidden="true" />
          ) : (
            <Upload className="size-5" aria-hidden="true" />
          )}
        </span>
        <span className="text-sm font-medium">
          {fileName ?? "Click to choose a file"}
        </span>
        <span className="text-muted-foreground text-xs leading-relaxed">
          {fileName ? "Click to replace this file" : description}
        </span>
      </label>
    </div>
  );
}
