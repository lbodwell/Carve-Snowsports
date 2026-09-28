import {
  AlertTriangle,
  Check,
  Plus,
  Save,
  Trash2,
  Undo2,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  approveGroupingDraft,
  assignDraftInstructor,
  createDraftGroup,
  createGroupingDraft,
  deleteDraftGroup,
  moveRegistration,
  publishGroupingDraft,
  submitGroupingDraft,
  undoDraftOperation,
  updateDraftGroup,
} from "@/server/functions/grouping-draft";

type Workspace = {
  program: { id: string; name: string; seasonName: string };
  draft: { id: string; version: number; status: string } | null;
  roster: Array<{
    registrationId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    disciplineId: string | null;
    abilityLevelId: string | null;
  }>;
  assignments: Array<{
    registrationId: string;
    draftGroupId: string;
  }>;
  groups: Array<{
    id: string;
    weekday: number;
    timeSlotId: string;
    disciplineId: string | null;
    abilityLevelId: string | null;
    ageBandId: string | null;
    leadInstructorId: string | null;
    notes: string | null;
    instructorIds: Array<string>;
  }>;
  instructors: Array<{
    id: string;
    firstName: string;
    lastName: string;
    disciplineIds: Array<string>;
  }>;
  disciplines: Array<{ id: string; label: string }>;
  abilityLevels: Array<{ id: string; label: string }>;
  ageBands: Array<{ id: string; label: string }>;
  timeSlots: Array<{ id: string; label: string }>;
  capabilities: {
    canEdit: boolean;
    canApprove: boolean;
    canUndo: boolean;
  };
  unplacedReasons: Record<string, string>;
};

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function PersistedGroupingBoard({
  workspace,
}: {
  workspace: Workspace;
}) {
  const router = useRouter();
  const [weekday, setWeekday] = useState(6);
  const [timeSlotId, setTimeSlotId] = useState(
    workspace.timeSlots[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = workspace.draft;
  const groups = useMemo(
    () =>
      workspace.groups.filter(
        (group) => group.weekday === weekday && group.timeSlotId === timeSlotId,
      ),
    [timeSlotId, weekday, workspace.groups],
  );
  const visibleGroupIds = new Set(groups.map((group) => group.id));
  const assignedIds = new Set(
    workspace.assignments
      .filter((assignment) => visibleGroupIds.has(assignment.draftGroupId))
      .map((assignment) => assignment.registrationId),
  );
  const unplaced = workspace.roster.filter(
    (registration) => !assignedIds.has(registration.registrationId),
  );

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The grouping draft could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!draft) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Create a grouping draft</CardTitle>
          <CardDescription>
            Generate a deterministic draft from registrations, instructors, and
            program configuration for {workspace.program.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={busy}
            onClick={() =>
              mutate(() =>
                createGroupingDraft({
                  data: { programId: workspace.program.id },
                }),
              )
            }
          >
            <Plus data-icon="inline-start" />
            {busy ? "Creating…" : "Create draft"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isEditing =
    draft.status === "editing" && workspace.capabilities.canEdit;

  const selectedTimeSlot =
    workspace.timeSlots.find((slot) => slot.id === timeSlotId)?.label ??
    "Time slot";

  return (
    <div className="flex flex-col gap-5">
      <header className="bg-card flex flex-col gap-4 rounded-xl border p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-primary text-sm font-medium">
            {workspace.program.seasonName} · {workspace.program.name}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Build lesson groups
          </h1>
          <p className="text-muted-foreground text-sm">
            Draft version {draft.version} · {draft.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {unplaced.length} unplaced · {workspace.groups.length} groups
          </Badge>
          {workspace.capabilities.canUndo ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                mutate(() =>
                  undoDraftOperation({
                    data: {
                      draftId: draft.id,
                      baseVersion: draft.version,
                      commandId: crypto.randomUUID(),
                    },
                  }),
                )
              }
            >
              <Undo2 data-icon="inline-start" />
              Undo last move
            </Button>
          ) : null}
          {isEditing ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                mutate(() =>
                  submitGroupingDraft({
                    data: {
                      draftId: draft.id,
                      baseVersion: draft.version,
                    },
                  }),
                )
              }
            >
              Submit for approval
            </Button>
          ) : null}
          {draft.status === "submitted" && workspace.capabilities.canApprove ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                mutate(() =>
                  approveGroupingDraft({
                    data: {
                      draftId: draft.id,
                      baseVersion: draft.version,
                    },
                  }),
                )
              }
            >
              Approve draft
            </Button>
          ) : null}
          {draft.status === "approved" && workspace.capabilities.canApprove ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => setPublishOpen(true)}
            >
              Publish groups
            </Button>
          ) : null}
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <label className="grid min-w-40 gap-1 text-sm font-medium">
            Day
            <Select
              value={String(weekday)}
              onValueChange={(value) => setWeekday(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weekdays.map((label, value) => (
                  <SelectItem key={label} value={String(value)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid min-w-40 gap-1 text-sm font-medium">
            Time
            <Select value={timeSlotId} onValueChange={setTimeSlotId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workspace.timeSlots.map((slot) => (
                  <SelectItem key={slot.id} value={slot.id}>
                    {slot.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            disabled={
              busy ||
              !isEditing ||
              !timeSlotId ||
              workspace.disciplines.length === 0
            }
            onClick={() =>
              mutate(() =>
                createDraftGroup({
                  data: {
                    draftId: draft.id,
                    baseVersion: draft.version,
                    commandId: crypto.randomUUID(),
                    weekday,
                    timeSlotId,
                    disciplineId: workspace.disciplines[0]!.id,
                    abilityLevelId: null,
                    ageBandId: null,
                  },
                }),
              )
            }
          >
            <Plus data-icon="inline-start" />
            New group
          </Button>
          <span className="text-muted-foreground pb-2 text-sm">
            {weekdays[weekday]} · {selectedTimeSlot}
          </span>
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Needs placement</CardTitle>
            <CardDescription>
              Students registered in this program but not yet assigned.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {unplaced.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                <Check className="mr-1 inline size-4" /> All students are
                placed.
              </p>
            ) : (
              unplaced.map((student) => (
                <div
                  key={student.registrationId}
                  className="rounded-lg border p-3"
                >
                  <StudentSummary student={student} />
                  {workspace.unplacedReasons[student.registrationId] ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {workspace.unplacedReasons[student.registrationId]}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2">
          {groups.length === 0 ? (
            <Card className="md:col-span-2">
              <CardContent className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
                <UsersRound className="size-4" />
                No groups in this day and time slot.
              </CardContent>
            </Card>
          ) : null}
          {groups.map((group, index) => {
            const students = workspace.assignments
              .filter((assignment) => assignment.draftGroupId === group.id)
              .flatMap((assignment) => {
                const student = workspace.roster.find(
                  (item) => item.registrationId === assignment.registrationId,
                );
                return student ? [student] : [];
              });
            const compatibleInstructors = workspace.instructors.filter(
              (instructor) =>
                !group.disciplineId ||
                instructor.disciplineIds.includes(group.disciplineId),
            );
            return (
              <Card key={group.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>Group {index + 1}</CardTitle>
                      <CardDescription>
                        {workspace.disciplines.find(
                          (item) => item.id === group.disciplineId,
                        )?.label ?? "Discipline not set"}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">
                      {students.length} students
                    </Badge>
                  </div>
                  <GroupConfiguration
                    group={group}
                    workspace={workspace}
                    busy={busy}
                    readOnly={!isEditing}
                    onSave={(values) =>
                      mutate(() =>
                        updateDraftGroup({
                          data: {
                            draftId: draft.id,
                            baseVersion: draft.version,
                            commandId: crypto.randomUUID(),
                            groupId: group.id,
                            ...values,
                          },
                        }),
                      )
                    }
                    onDelete={() => setDeleteGroupId(group.id)}
                  />
                  <InstructorConfiguration
                    busy={busy}
                    readOnly={!isEditing}
                    group={group}
                    instructors={compatibleInstructors}
                    onSave={(instructorIds, leadInstructorId) =>
                      mutate(() =>
                        assignDraftInstructor({
                          data: {
                            draftId: draft.id,
                            baseVersion: draft.version,
                            commandId: crypto.randomUUID(),
                            groupId: group.id,
                            instructorIds,
                            leadInstructorId,
                          },
                        }),
                      )
                    }
                  />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {students.map((student) => (
                    <div
                      key={student.registrationId}
                      className="flex items-center justify-between gap-2 rounded-lg border p-3"
                    >
                      <StudentSummary student={student} />
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy || !isEditing}
                        onClick={() =>
                          mutate(() =>
                            moveRegistration({
                              data: {
                                draftId: draft.id,
                                baseVersion: draft.version,
                                commandId: crypto.randomUUID(),
                                registrationId: student.registrationId,
                                groupId: null,
                                fromGroupId: group.id,
                              },
                            }),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  {unplaced.length > 0 && isEditing ? (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {unplaced.map((student) => (
                        <Button
                          key={student.registrationId}
                          size="xs"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            mutate(() =>
                              moveRegistration({
                                data: {
                                  draftId: draft.id,
                                  baseVersion: draft.version,
                                  commandId: crypto.randomUUID(),
                                  registrationId: student.registrationId,
                                  groupId: group.id,
                                },
                              }),
                            )
                          }
                        >
                          Place {student.firstName}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {!group.leadInstructorId ? (
                    <p className="text-destructive flex items-center gap-1 pt-2 text-xs">
                      <AlertTriangle className="size-3.5" />
                      Lead instructor required before publication.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Stable group numbers and lesson instances will be created.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void mutate(() =>
                  publishGroupingDraft({
                    data: {
                      draftId: draft.id,
                      idempotencyKey: crypto.randomUUID(),
                    },
                  }),
                )
              }
            >
              Publish groups
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={deleteGroupId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteGroupId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft group?</AlertDialogTitle>
            <AlertDialogDescription>
              Students in the group will return to the unplaced list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep group</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteGroupId) return;
                void mutate(() =>
                  deleteDraftGroup({
                    data: {
                      draftId: draft.id,
                      baseVersion: draft.version,
                      commandId: crypto.randomUUID(),
                      groupId: deleteGroupId,
                    },
                  }),
                );
              }}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InstructorConfiguration({
  busy,
  readOnly,
  group,
  instructors,
  onSave,
}: {
  busy: boolean;
  readOnly: boolean;
  group: Workspace["groups"][number];
  instructors: Workspace["instructors"];
  onSave: (
    instructorIds: Array<string>,
    leadInstructorId: string | null,
  ) => void;
}) {
  const [selected, setSelected] = useState(group.instructorIds);
  const [lead, setLead] = useState(group.leadInstructorId ?? "");

  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-medium">Instructors</legend>
      <div className="flex flex-wrap gap-3">
        {instructors.map((instructor) => (
          <label
            key={instructor.id}
            className="flex cursor-pointer items-center gap-1.5 text-xs"
          >
            <Checkbox
              disabled={readOnly}
              checked={selected.includes(instructor.id)}
              onCheckedChange={(checked) => {
                const next =
                  checked === true
                    ? [...selected, instructor.id]
                    : selected.filter((id) => id !== instructor.id);
                setSelected(next);
                if (!next.includes(lead)) setLead(next[0] ?? "");
              }}
            />
            {instructor.firstName} {instructor.lastName}
          </label>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="grid flex-1 gap-1 text-xs font-medium">
          Lead
          <Select
            disabled={readOnly}
            value={lead || "none"}
            onValueChange={(value) => setLead(value === "none" ? "" : value)}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {instructors
                .filter((instructor) => selected.includes(instructor.id))
                .map((instructor) => (
                  <SelectItem key={instructor.id} value={instructor.id}>
                    {instructor.firstName} {instructor.lastName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy || readOnly || (selected.length > 0 && !lead)}
          onClick={() => onSave(selected, lead || null)}
        >
          Save staff
        </Button>
      </div>
    </fieldset>
  );
}

function GroupConfiguration({
  busy,
  group,
  onDelete,
  onSave,
  readOnly,
  workspace,
}: {
  busy: boolean;
  group: Workspace["groups"][number];
  onDelete: () => void;
  onSave: (values: {
    weekday: number;
    timeSlotId: string;
    disciplineId: string;
    abilityLevelId: string | null;
    ageBandId: string | null;
    notes: string;
  }) => void;
  readOnly: boolean;
  workspace: Workspace;
}) {
  const [disciplineId, setDisciplineId] = useState(group.disciplineId ?? "");
  const [weekday, setWeekday] = useState(group.weekday);
  const [timeSlotId, setTimeSlotId] = useState(group.timeSlotId);
  const [abilityLevelId, setAbilityLevelId] = useState(
    group.abilityLevelId ?? "",
  );
  const [ageBandId, setAgeBandId] = useState(group.ageBandId ?? "");
  const [notes, setNotes] = useState(group.notes ?? "");

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-medium">
          Day
          <Select
            disabled={readOnly}
            value={String(weekday)}
            onValueChange={(value) => setWeekday(Number(value))}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekdays.map((label, value) => (
                <SelectItem key={label} value={String(value)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Time
          <Select value={timeSlotId} onValueChange={setTimeSlotId}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspace.timeSlots.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Discipline
          <Select value={disciplineId} onValueChange={setDisciplineId}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {workspace.disciplines.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Level
          <Select
            value={abilityLevelId || "any"}
            onValueChange={(value) =>
              setAbilityLevelId(value === "any" ? "" : value)
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {workspace.abilityLevels.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Ages
          <Select
            value={ageBandId || "any"}
            onValueChange={(value) =>
              setAgeBandId(value === "any" ? "" : value)
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {workspace.ageBands.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium">
        Notes
        <Textarea
          className="min-h-16 text-xs"
          disabled={readOnly}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={busy || readOnly || !disciplineId}
          onClick={() =>
            onSave({
              weekday,
              timeSlotId,
              disciplineId,
              abilityLevelId: abilityLevelId || null,
              ageBandId: ageBandId || null,
              notes,
            })
          }
        >
          <Save data-icon="inline-start" />
          Save details
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={busy || readOnly}
          onClick={onDelete}
          aria-label="Delete group"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function StudentSummary({
  student,
}: {
  student: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
  };
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">
        {student.firstName} {student.lastName}
      </p>
      <p className="text-muted-foreground text-xs">
        Born {student.dateOfBirth ?? "not recorded"}
      </p>
    </div>
  );
}
