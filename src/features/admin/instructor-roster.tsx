import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { AuditHistoryPanel } from "@/features/admin/audit-history-panel";

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
    setShowForm(true);
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
    try {
      await archiveInstructor({ data: { instructorId: instructor.id } });
      setInstructorToArchive(null);
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The instructor could not be archived.",
      );
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
        <Button onClick={startCreate}>
          <Plus data-icon="inline-start" />
          Add instructor
        </Button>
      </header>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit instructor" : "Add instructor"}
            </CardTitle>
            <CardDescription>
              At least one contact method and discipline are required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              {(["firstName", "lastName", "phone", "email"] as const).map(
                (field) => (
                  <label
                    key={field}
                    className="grid gap-1.5 text-sm font-medium"
                  >
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
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
            {editingId ? (
              <div className="mt-6">
                {auditHistoryLoading ? (
                  <p className="text-muted-foreground text-sm">
                    Loading audit history…
                  </p>
                ) : (
                  <AuditHistoryPanel
                    title="Audit history"
                    description="Recorded roster changes for this instructor."
                    events={auditHistory}
                  />
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, contact, or notes"
                className="pr-8 pl-8"
              />
              {query ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-1.5 right-1"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X />
                </Button>
              ) : null}
            </label>
            <label className="grid min-w-40 gap-1 text-sm font-medium">
              <span className="sr-only">Discipline</span>
              <Select value={discipline} onValueChange={setDiscipline}>
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
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((instructor) => (
                  <TableRow key={instructor.id}>
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
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => startEdit(instructor)}
                          aria-label={`Edit ${instructor.firstName} ${instructor.lastName}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setInstructorToArchive(instructor)}
                          aria-label={`Archive ${instructor.firstName} ${instructor.lastName}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
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
