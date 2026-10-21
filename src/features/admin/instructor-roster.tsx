import { Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { AuditHistoryPanel } from "@/features/admin/audit-history-panel";
import {
  RosterDetailsDialog,
  RosterPagination,
  RosterRow,
} from "@/features/admin/roster-ui";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveInstructor,
  saveInstructor,
} from "@/server/functions/instructors";
import { getInstructorAuditHistory } from "@/server/functions/audit-history";

type InstructorRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  disciplines: Array<{ key: string; label: string }>;
};

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  notes: "",
  ski: true,
  snowboard: false,
};

export function InstructorRoster({
  instructors,
}: {
  instructors: Array<InstructorRow>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const detailsTrigger = useRef<HTMLElement | null>(null);
  const selectedInstructor = instructors.find(
    (instructor) => instructor.id === editingId,
  );
  const [error, setError] = useState<string | null>(null);
  const [instructorToArchive, setInstructorToArchive] =
    useState<InstructorRow | null>(null);
  const [auditHistory, setAuditHistory] = useState<
    Awaited<ReturnType<typeof getInstructorAuditHistory>>
  >([]);
  const [auditHistoryLoading, setAuditHistoryLoading] = useState(false);

  useEffect(() => {
    if (!editingId) {
      setAuditHistory([]);
      return;
    }

    let cancelled = false;
    setAuditHistoryLoading(true);
    void getInstructorAuditHistory({ data: { instructorId: editingId } })
      .then((events) => {
        if (!cancelled) setAuditHistory(events);
      })
      .catch(() => {
        if (!cancelled) setError("Audit history could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setAuditHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editingId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return instructors.filter((instructor) => {
      const matchesQuery = [
        instructor.firstName,
        instructor.lastName,
        instructor.phone,
        instructor.email,
        instructor.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
      return (
        matchesQuery &&
        (discipline === "all" ||
          instructor.disciplines.some((item) => item.key === discipline))
      );
    });
  }, [discipline, instructors, query]);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / pageSize)),
  );
  const pageRows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function startEdit(instructor: InstructorRow) {
    setEditingId(instructor.id);
    setForm({
      firstName: instructor.firstName,
      lastName: instructor.lastName,
      phone: instructor.phone,
      email: instructor.email,
      notes: instructor.notes,
      ski: instructor.disciplines.some((item) => item.key === "ski"),
      snowboard: instructor.disciplines.some(
        (item) => item.key === "snowboard",
      ),
    });
    setError(null);
    setShowForm(false);
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveInstructor({
        data: {
          ...(editingId ? { instructorId: editingId } : {}),
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          email: form.email,
          notes: form.notes,
          disciplineKeys: [
            ...(form.ski ? (["ski"] as const) : []),
            ...(form.snowboard ? (["snowboard"] as const) : []),
          ],
        },
      });
      setShowForm(false);
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The instructor could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(instructor: InstructorRow) {
    setError(null);
    setArchiving(true);
    try {
      await archiveInstructor({ data: { instructorId: instructor.id } });
      setInstructorToArchive(null);
      setEditingId(null);
      setShowForm(false);
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The instructor could not be archived.",
      );
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-muted-foreground text-sm font-medium">
            Staff roster
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Instructors</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Manage contact details and discipline qualifications.
          </p>
        </div>
        <Button
          onClick={(event) => {
            detailsTrigger.current = event.currentTarget;
            startCreate();
          }}
        >
          <Plus data-icon="inline-start" />
          Add instructor
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>
            {instructors.length} active instructor
            {instructors.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex max-w-xl flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search instructors</span>
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name, contact, or notes"
                className="pr-8 pl-8"
              />
              {query ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1.5 right-1"
                  onClick={() => {
                    setQuery("");
                    setPage(1);
                  }}
                  aria-label="Clear search"
                >
                  <X />
                </Button>
              ) : null}
            </label>
            <label className="grid min-w-40 gap-1 text-sm font-medium">
              <span className="sr-only">Discipline</span>
              <Select
                value={discipline}
                onValueChange={(value) => {
                  setDiscipline(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All disciplines</SelectItem>
                  <SelectItem value="ski">Ski</SelectItem>
                  <SelectItem value="snowboard">Snowboard</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <p role="status" className="text-muted-foreground text-sm">
            {filtered.length} matching instructor
            {filtered.length === 1 ? "" : "s"}
          </p>
          {error && !showForm ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div className="rounded-xl border">
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Disciplines</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((instructor) => (
                  <RosterRow
                    key={instructor.id}
                    aria-label={`View instructor ${instructor.firstName} ${instructor.lastName}`}
                    onOpen={(element) => {
                      detailsTrigger.current = element;
                      startEdit(instructor);
                    }}
                  >
                    <TableCell className="font-medium">
                      {instructor.firstName} {instructor.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {instructor.disciplines.map((item) => (
                          <Badge key={item.key} variant="outline">
                            {item.label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div>{instructor.phone || "—"}</div>
                      <div>{instructor.email}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-64">
                      <span className="line-clamp-2">
                        {instructor.notes || "—"}
                      </span>
                    </TableCell>
                  </RosterRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filtered.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No instructors match these filters.
            </p>
          )}
          <RosterPagination
            total={filtered.length}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </CardContent>
      </Card>
      <RosterDetailsDialog
        open={showForm || Boolean(editingId)}
        onOpenChange={(open) => {
          if (!open && !saving && !archiving) {
            setShowForm(false);
            setEditingId(null);
            setError(null);
          }
        }}
        restoreFocusTo={detailsTrigger}
        title={
          editingId
            ? `${selectedInstructor?.firstName ?? ""} ${selectedInstructor?.lastName ?? ""} · ${showForm ? "Edit instructor" : "Instructor details"}`
            : "Add instructor"
        }
        description={
          showForm
            ? "At least one contact method and discipline are required."
            : "Contact details, qualifications and notes."
        }
      >
        {showForm ? (
          <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
            {(["firstName", "lastName", "phone", "email"] as const).map(
              (field) => (
                <label key={field} className="grid gap-1.5 text-sm font-medium">
                  {field === "firstName"
                    ? "First name"
                    : field === "lastName"
                      ? "Last name"
                      : field === "phone"
                        ? "Phone"
                        : "Email"}
                  <Input
                    required={field === "firstName" || field === "lastName"}
                    type={field === "email" ? "email" : "text"}
                    value={form[field]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                  />
                </label>
              ),
            )}
            <fieldset className="flex flex-wrap gap-4 sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium">
                Disciplines
              </legend>
              {(["ski", "snowboard"] as const).map((disciplineKey) => (
                <label
                  key={disciplineKey}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={form[disciplineKey]}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        [disciplineKey]: checked === true,
                      }))
                    }
                  />
                  {disciplineKey === "ski" ? "Ski" : "Snowboard"}
                </label>
              ))}
            </fieldset>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
              Notes
              <Textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
            {error ? (
              <p
                role="alert"
                className="text-destructive text-sm sm:col-span-2"
              >
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button disabled={saving} type="submit">
                {saving ? "Saving…" : "Save instructor"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : selectedInstructor ? (
          <>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{selectedInstructor.phone || "Not recorded"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{selectedInstructor.email || "Not recorded"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Disciplines</dt>
                <dd>
                  {selectedInstructor.disciplines
                    .map((item) => item.label)
                    .join(", ") || "Not recorded"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-wrap">
                  {selectedInstructor.notes || "Not recorded"}
                </dd>
              </div>
            </dl>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setShowForm(true)}>
                Edit instructor
              </Button>
              <Button
                variant="destructive"
                disabled={archiving}
                onClick={() => setInstructorToArchive(selectedInstructor)}
              >
                Archive instructor
              </Button>
              <Button onClick={() => setEditingId(null)}>Close details</Button>
            </div>
          </>
        ) : null}
        {editingId &&
          (auditHistoryLoading ? (
            <p className="text-muted-foreground text-sm">
              Loading audit history…
            </p>
          ) : (
            <AuditHistoryPanel
              title="Audit history"
              description="Recorded roster changes for this instructor."
              events={auditHistory}
            />
          ))}
      </RosterDetailsDialog>
      <AlertDialog
        open={instructorToArchive !== null}
        onOpenChange={(open) => {
          if (!open) setInstructorToArchive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Archive {instructorToArchive?.firstName}{" "}
              {instructorToArchive?.lastName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the instructor from the working roster. Audit history
              is retained.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep instructor</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              onClick={() => {
                if (instructorToArchive)
                  void handleArchive(instructorToArchive);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
