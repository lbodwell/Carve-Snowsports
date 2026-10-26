import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  GraduationCap,
  Plus,
  Settings2,
  Sparkles,
  Undo2,
  UsersRound,
} from "lucide-react";
import { GroupLifecyclePanel } from "./group-lifecycle-panel";
import {
  GroupConfiguration,
  InstructorConfiguration,
} from "./grouping-editors";
import type { GroupingView } from "@/domain/grouping/workspace-query";
import type { getGroupingWorkspace } from "@/server/functions/grouping-draft";
import { staffingGuidance } from "@/domain/grouping/staffing-ratio";
import { descriptiveGroupLabel } from "@/domain/grouping/group-label";
import { instructorAvailability } from "@/domain/grouping/instructor-preferences";
import { computeAgeOnDate } from "@/domain/calendar/student-age";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { weekdayNames as weekdays } from "@/domain/grouping/registration-schedule";
import { sessionsOverlap } from "@/domain/calendar/session-calendar";
import { cn } from "@/lib/utils";
import {
  approveGroupingDraft,
  assignDraftInstructor,
  createDraftGroup,
  createGroupingDraft,
  deleteDraftGroup,
  moveRegistration,
  publishGroupingDraft,
  rebuildDraft,
  returnGroupingDraft,
  saveRegistrationSchedule,
  splitGroup,
  submitGroupingDraft,
  suggestRemainingDraftPlacements,
  undoDraftOperation,
  undoDraftRebuild,
  updateDraftGroup,
} from "@/server/functions/grouping-draft";

export type Workspace = Awaited<ReturnType<typeof getGroupingWorkspace>>;
type Student = Workspace["roster"][number];
const findLabel = (
  items: Array<{ id: string; label: string }>,
  id: string | null,
) => items.find((item) => item.id === id)?.label;

export function PersistedGroupingBoard({
  workspace,
  initialFilters = {},
}: {
  initialFilters?: GroupingView;
  workspace: Workspace;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [extraFilters, setExtraFilters] = useState(initialFilters);
  const activeDays = [
    ...new Set(workspace.timeSlots.flatMap((slot) => slot.allowedWeekdays)),
  ].sort();
  const [weekday, setWeekday] = useState(
    initialFilters.weekday ??
      workspace.groups[0]?.weekday ??
      activeDays[0] ??
      6,
  );
  const [timeSlotId, setTimeSlotId] = useState(
    initialFilters.timeSlotId ??
      workspace.groups[0]?.timeSlotId ??
      workspace.timeSlots[0]?.id ??
      "",
  );
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState(
    initialFilters.disciplineId ?? "all",
  );
  const [rosterView, setRosterView] = useState<string>(
    initialFilters.view ?? "unplaced",
  );
  const [selected, setSelected] = useState<{
    registrationId: string;
    fromGroupId?: string;
  } | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [splitSelection, setSplitSelection] = useState<Array<string>>([]);
  const [rebuildScope, setRebuildScope] = useState<"session" | "program">(
    "session",
  );
  const [rebuildPreview, setRebuildPreview] = useState<Awaited<
    ReturnType<typeof rebuildDraft>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("Changes save as you go.");
  const [confirm, setConfirm] = useState<"publish" | "delete" | null>(null);
  const [applyToMatching, setApplyToMatching] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const draft = workspace.draft;
  const editable =
    draft?.status === "editing" && workspace.capabilities.canEdit;
  const groups = workspace.groups.filter(
    (group) =>
      (extraFilters.allSessions ||
        (group.weekday === weekday && group.timeSlotId === timeSlotId)) &&
      (discipline === "all" || group.disciplineId === discipline) &&
      (!extraFilters.ageBandId || group.ageBandId === extraFilters.ageBandId) &&
      (!extraFilters.levelId ||
        group.abilityLevelId === extraFilters.levelId) &&
      (extraFilters.groupSize === undefined ||
        workspace.assignments.filter((row) => row.draftGroupId === group.id)
          .length === extraFilters.groupSize) &&
      (!extraFilters.staffing ||
        Boolean(group.leadInstructorId) ===
          (extraFilters.staffing === "staffed")),
  );
  groups.sort(
    (a, b) =>
      workspace.disciplines.findIndex((item) => item.id === a.disciplineId) -
        workspace.disciplines.findIndex((item) => item.id === b.disciplineId) ||
      (workspace.ageBands.find((band) => band.id === a.ageBandId)?.minimumAge ??
        0) -
        (workspace.ageBands.find((band) => band.id === b.ageBandId)
          ?.minimumAge ?? 0) ||
      (workspace.abilityLevels.find((level) => level.id === a.abilityLevelId)
        ?.numericRank ?? 0) -
        (workspace.abilityLevels.find((level) => level.id === b.abilityLevelId)
          ?.numericRank ?? 0) ||
      a.displayOrdinal - b.displayOrdinal,
  );
  const laneKey = (group: Workspace["groups"][number]) =>
    `${group.disciplineId}:${group.ageBandId}`;
  const lanes = [...new Set(groups.map(laneKey))].map((key) => ({
    key,
    groups: groups.filter((group) => laneKey(group) === key),
  }));
  const assignedIds = new Set(
    workspace.assignments.map((assignment) => assignment.registrationId),
  );
  const unplaced = workspace.roster.filter(
    (student) =>
      student.registrationStatus === "active" &&
      !assignedIds.has(student.registrationId),
  );
  const selectedStudent = workspace.roster.find(
    (student) => student.registrationId === selected?.registrationId,
  );
  const editingGroup = workspace.groups.find(
    (group) => group.id === editingGroupId,
  );
  const missingLeads = workspace.groups.filter(
    (group) =>
      !group.leadInstructorId &&
      workspace.assignments.some((row) => row.draftGroupId === group.id),
  ).length;
  const groupName = (id: string) => {
    const group = workspace.groups.find((item) => item.id === id);
    if (!group) return "Group details";
    const peers = workspace.groups.filter(
      (item) =>
        item.weekday === group.weekday &&
        item.timeSlotId === group.timeSlotId &&
        item.disciplineId === group.disciplineId &&
        item.ageBandId === group.ageBandId &&
        item.abilityLevelId === group.abilityLevelId,
    );
    const lead = workspace.instructors.find(
      (item) => item.id === group.leadInstructorId,
    );
    const instructor = lead ? lead.firstName + " " + lead.lastName : null;
    return descriptiveGroupLabel({
      context: extraFilters.allSessions
        ? `${weekdays[group.weekday]} · ${findLabel(workspace.timeSlots, group.timeSlotId)}`
        : undefined,
      discipline: findLabel(workspace.disciplines, group.disciplineId),
      ageBand: findLabel(workspace.ageBands, group.ageBandId),
      level: findLabel(workspace.abilityLevels, group.abilityLevelId),
      instructor,
      ordinal: group.displayOrdinal,
      duplicate: peers.length > 1,
      duplicateInstructor:
        peers.filter((item) => {
          const peer = workspace.instructors.find(
            (person) => person.id === item.leadInstructorId,
          );
          return peer && `${peer.firstName} ${peer.lastName}` === instructor;
        }).length > 1,
    });
  };
  const instructorCandidates = (group: Workspace["groups"][number]) => {
    const slot = workspace.timeSlots.find(
      (item) => item.id === group.timeSlotId,
    );
    if (!slot) return [];
    const band = workspace.ageBands.find((item) => item.id === group.ageBandId);
    const level = workspace.abilityLevels.find(
      (item) => item.id === group.abilityLevelId,
    );
    return workspace.instructors
      .map((instructor) => ({
        instructor,
        ...instructorAvailability(
          instructor.preferences,
          { ...slot, programId: workspace.program.id, weekday: group.weekday },
          band,
          level?.numericRank,
        ),
      }))
      .filter(
        (item) =>
          item.eligible &&
          item.instructor.disciplineIds.includes(group.disciplineId ?? "") &&
          !workspace.groups.some(
            (other) =>
              other.id !== group.id &&
              other.weekday === group.weekday &&
              other.instructorIds.includes(item.instructor.id) &&
              sessionsOverlap(
                slot,
                workspace.timeSlots.find(
                  (candidate) => candidate.id === other.timeSlotId,
                )!,
                group.weekday,
              ),
          ),
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.instructor.lastName.localeCompare(b.instructor.lastName),
      );
  };
  const assignLead = (
    group: Workspace["groups"][number],
    instructorId: string | null,
  ) =>
    draft &&
    mutate(
      () =>
        assignDraftInstructor({
          data: {
            draftId: draft.id,
            baseVersion: draft.version,
            commandId: crypto.randomUUID(),
            groupId: group.id,
            instructorIds: instructorId
              ? [...new Set([...group.instructorIds, instructorId])]
              : group.instructorIds.filter(
                  (id) => id !== group.leadInstructorId,
                ),
            leadInstructorId: instructorId,
          },
        }),
      instructorId ? "Instructor assigned." : "Lead instructor removed.",
    );
  const roster = workspace.roster.filter(
    (student) =>
      `${student.firstName} ${student.lastName}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (discipline === "all" || student.disciplineId === discipline) &&
      (!extraFilters.levelId ||
        student.abilityLevelId === extraFilters.levelId) &&
      (extraFilters.weekday === undefined ||
        student.schedule?.weekday === extraFilters.weekday) &&
      (!extraFilters.timeSlotId ||
        student.schedule?.timeSlotId === extraFilters.timeSlotId) &&
      (rosterView !== "unplaced" ||
        (student.registrationStatus === "active" &&
          !assignedIds.has(student.registrationId))) &&
      (rosterView !== "review" ||
        student.registrationStatus !== "active" ||
        student.needsSchedule ||
        !student.dateOfBirth ||
        !student.abilityLevelId ||
        !student.disciplineId),
  );

  async function mutate(
    action: () => Promise<unknown>,
    success = "Saved. Everyone is up to date.",
  ) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      await router.invalidate();
      setNotice(success);
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The change could not be saved. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function place(groupId: string | null) {
    if (!draft || !selected) return;
    if (
      await mutate(
        () =>
          moveRegistration({
            data: {
              draftId: draft.id,
              baseVersion: draft.version,
              commandId: crypto.randomUUID(),
              registrationId: selected.registrationId,
              fromGroupId: selected.fromGroupId,
              overrideReason: overrideReason.trim() || undefined,
              groupId,
            },
          }),
        groupId
          ? `Student moved to ${groupName(groupId)}.`
          : "Student returned to Needs placement.",
      )
    )
      setSelected({
        registrationId: selected.registrationId,
        fromGroupId: groupId ?? undefined,
      });
  }
  function studentCard(student: Student, fromGroupId?: string) {
    const placementGroupId =
      fromGroupId ??
      workspace.assignments.find(
        (assignment) => assignment.registrationId === student.registrationId,
      )?.draftGroupId;
    const active =
      selected?.registrationId === student.registrationId &&
      selected.fromGroupId === placementGroupId;
    const placedElsewhere =
      !fromGroupId && assignedIds.has(student.registrationId);
    return (
      <button
        key={student.registrationId}
        draggable={editable && !busy}
        onDragStart={(event) => {
          setSelected({
            registrationId: student.registrationId,
            fromGroupId: placementGroupId,
          });
          event.dataTransfer.setData(
            "application/carve-student",
            JSON.stringify({
              registrationId: student.registrationId,
              fromGroupId: placementGroupId ?? null,
            }),
          );
        }}
        type="button"
        disabled={busy}
        aria-pressed={active}
        onClick={() => {
          setApplyToMatching(false);
          setOverrideReason("");
          setSelected(
            active
              ? null
              : {
                  registrationId: student.registrationId,
                  fromGroupId: placementGroupId,
                },
          );
        }}
        className={cn(
          "hover:border-pm-green focus-visible:outline-pm-green w-full rounded-xl border bg-white p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default",
          active && "border-pm-green bg-pm-mist ring-pm-green/20 ring-2",
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            {student.firstName} {student.lastName}
          </span>
          {active && <Check className="text-pm-green size-4" />}
        </span>
        <span className="text-muted-foreground mt-1 block text-xs">
          {!fromGroupId &&
            `${findLabel(workspace.disciplines, student.disciplineId) ?? "Discipline needed"} · `}
          {findLabel(workspace.abilityLevels, student.abilityLevelId) ??
            "Level needed"}{" "}
          ·{" "}
          {student.dateOfBirth
            ? `Age ${computeAgeOnDate(student.dateOfBirth, workspace.program.seasonStartsOn)}`
            : "Birthdate needed"}
        </span>
        {(student.placementNotes || student.survey?.placementNotes) && (
          <span className="mt-2 block rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
            <span className="font-medium">Placement note</span>
            <span className="mt-0.5 line-clamp-2 whitespace-pre-wrap">
              {student.placementNotes || student.survey?.placementNotes}
            </span>
            <span className="mt-1 block text-[10px] text-amber-800">
              Select to read all notes
            </span>
          </span>
        )}
        {student.survey?.hasSupportReview && (
          <span className="mt-1 block text-xs text-amber-800">
            Support information to review
          </span>
        )}
        {student.needsSchedule && (
          <span className="mt-1 block text-xs text-amber-800">
            Confirm session · {student.sourceScheduleLabel}
          </span>
        )}
        {student.registrationStatus !== "active" && (
          <span className="mt-1 block text-xs font-medium text-amber-800">
            Registration {student.registrationStatus} · remove this placement
          </span>
        )}
        {!fromGroupId &&
          !assignedIds.has(student.registrationId) &&
          workspace.unplacedReasons[student.registrationId] && (
            <span className="text-muted-foreground mt-1 block text-xs">
              {workspace.unplacedReasons[student.registrationId]}
            </span>
          )}
        {placedElsewhere && (
          <span className="text-pm-green mt-1 block text-xs">
            Placed · select to view notes or move
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {Object.keys(extraFilters).some((key) => key !== "programId") && (
        <div className="flex items-center gap-3 rounded border p-3 text-sm">
          Dashboard filters applied
          <Button
            variant="outline"
            onClick={() => {
              setExtraFilters({});
              setDiscipline("all");
              setRosterView("unplaced");
              void navigate({
                to: "/grouping",
                search: { programId: workspace.program.id },
              });
            }}
          >
            Clear dashboard filters
          </Button>
        </div>
      )}
      {!activeDays.length && (
        <p role="status" className="rounded border border-amber-400 p-4">
          Session weekdays need configuration.{" "}
          <Link to="/admin/seasons" className="underline">
            Review program schedules
          </Link>{" "}
          before creating groups.
        </p>
      )}
      {draft?.finalizedSnapshot && (
        <GroupLifecyclePanel workspace={workspace} />
      )}
      {editable && (
        <section
          className="space-y-3 rounded-xl border bg-white p-4"
          aria-label="Re-group all"
        >
          <div className="flex flex-wrap items-center gap-3">
            <strong>Re-group all</strong>
            <select
              aria-label="Rebuild scope"
              value={rebuildScope}
              onChange={(e) => {
                setRebuildScope(e.target.value as "session" | "program");
                setRebuildPreview(null);
              }}
            >
              <option value="session">Visible day/time</option>
              <option value="program">Whole program</option>
            </select>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                mutate(async () => {
                  setRebuildPreview(
                    await rebuildDraft({
                      data: {
                        draftId: draft.id,
                        baseVersion: draft.version,
                        commandId: crypto.randomUUID(),
                        weekday,
                        timeSlotId,
                        scope: rebuildScope,
                      },
                    }),
                  );
                }, "Rebuild preview ready. No placements changed.")
              }
            >
              Preview rebuild
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !workspace.capabilities.canUndoRebuild}
              onClick={() =>
                mutate(
                  () =>
                    undoDraftRebuild({
                      data: {
                        draftId: draft.id,
                        baseVersion: draft.version,
                        commandId: crypto.randomUUID(),
                      },
                    }),
                  "Previous layout restored.",
                )
              }
            >
              Undo rebuild
            </Button>
          </div>
          {rebuildPreview && (
            <div role="status">
              <p>
                {rebuildPreview.oldGroups} existing groups →{" "}
                {rebuildPreview.newGroups} new groups; {rebuildPreview.students}{" "}
                registrations; {rebuildPreview.unresolved} unresolved;{" "}
                {rebuildPreview.clearedInstructors} instructor assignments
                cleared. Previous layout and group notes remain in history.
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  mutate(async () => {
                    await rebuildDraft({
                      data: {
                        draftId: draft.id,
                        baseVersion: rebuildPreview.version,
                        commandId: crypto.randomUUID(),
                        weekday,
                        timeSlotId,
                        scope: rebuildScope,
                        previewHash: rebuildPreview.previewHash,
                      },
                    });
                    setRebuildPreview(null);
                  }, "Groups rebuilt without instructor assignments.")
                }
              >
                Replace scoped draft groups
              </Button>
              <Button variant="ghost" onClick={() => setRebuildPreview(null)}>
                Cancel
              </Button>
            </div>
          )}
        </section>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-pm-green text-sm font-medium">
            {workspace.program.seasonName}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Build lesson groups
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Start with suggested groups. Select a student, then choose their
            group.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/imports">Import registrations</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              to="/admin/surveys"
              search={{
                sort: "newest",
                q: "",
                page: 1,
                pageSize: 25,
                link: "all",
                session: "",
                discipline: "",
                level: "",
                from: "",
                until: "",
              }}
            >
              Review surveys
            </Link>
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
        <label className="min-w-56 flex-1 text-xs font-medium">
          Season & program
          <select
            aria-label="Season and program"
            className="mt-1 block w-full rounded-md border bg-white p-2 text-sm"
            value={workspace.program.id}
            disabled={busy}
            onChange={(event) =>
              void navigate({
                to: "/grouping",
                search: { programId: event.target.value },
              })
            }
          >
            {workspace.availablePrograms.map((program) => (
              <option key={program.id} value={program.id}>
                {program.seasonName} · {program.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-6 px-3 text-sm">
          <span>
            <strong className="block text-xl">{workspace.roster.length}</strong>
            students
          </span>
          <span>
            <strong className="block text-xl text-amber-800">
              {unplaced.length}
            </strong>
            need placement
          </span>
          <span>
            <strong className="block text-xl">{workspace.groups.length}</strong>
            groups
          </span>
        </div>
        {draft && (
          <span className="bg-pm-mist rounded-full px-3 py-1 text-xs font-medium">
            {draft.status === "editing"
              ? "Draft"
              : draft.status === "submitted"
                ? "Awaiting approval"
                : draft.status === "published"
                  ? "Published"
                  : "Approved"}
          </span>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
        >
          <span>{error}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void mutate(
                () => router.invalidate(),
                "Latest changes loaded. Select the student again to retry.",
              )
            }
          >
            Reload latest changes
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Picker
          label="Day"
          value={String(weekday)}
          onChange={(value) => {
            setWeekday(Number(value));
            setSelected(null);
          }}
          items={weekdays
            .map((day, index) => ({
              id: String(index),
              label: day,
            }))
            .filter((item) => activeDays.includes(Number(item.id)))}
        />
        <Picker
          label="Time"
          value={timeSlotId}
          onChange={(value) => {
            setTimeSlotId(value);
            setSelected(null);
          }}
          items={workspace.timeSlots
            .filter((slot) => slot.allowedWeekdays.includes(weekday))
            .map((slot) => ({
              ...slot,
              label: `${slot.cohort === "session-1" ? "Session 1 · " : slot.cohort === "session-2" ? "Session 2 · " : ""}${slot.label} (${slot.startsAt.slice(0, 5)}–${slot.endsAt.slice(0, 5)})`,
            }))}
        />
        <Picker
          label="Discipline"
          value={discipline}
          onChange={setDiscipline}
          items={[
            { id: "all", label: "All disciplines" },
            ...workspace.disciplines,
          ]}
        />
        {editable && (
          <Button
            disabled={busy || !timeSlotId || !workspace.disciplines.length}
            onClick={() =>
              void mutate(() =>
                createDraftGroup({
                  data: {
                    draftId: draft.id,
                    baseVersion: draft.version,
                    commandId: crypto.randomUUID(),
                    weekday,
                    timeSlotId,
                    disciplineId:
                      discipline === "all"
                        ? workspace.disciplines[0]!.id
                        : discipline,
                    abilityLevelId: null,
                    ageBandId: null,
                  },
                }),
              )
            }
          >
            <Plus />
            New group
          </Button>
        )}
        {editable && (
          <Button
            variant="outline"
            disabled={busy || !unplaced.length || !timeSlotId}
            onClick={() =>
              void mutate(
                () =>
                  suggestRemainingDraftPlacements({
                    data: {
                      draftId: draft.id,
                      baseVersion: draft.version,
                      weekday,
                      timeSlotId,
                    },
                  }),
                "Remaining placements suggested. Your existing placements were preserved.",
              )
            }
          >
            <Sparkles />
            Suggest remaining placements
          </Button>
        )}
        <p role="status" className="text-muted-foreground ml-auto pb-2 text-xs">
          {busy ? "Saving…" : notice}
        </p>
      </div>
      {(() => {
        const slot = workspace.timeSlots.find((item) => item.id === timeSlotId);
        return slot ? (
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span>
              {slot.cohort === "session-1"
                ? "Session 1 · "
                : slot.cohort === "session-2"
                  ? "Session 2 · "
                  : ""}
              {slot.startsOn && slot.endsOn
                ? `${slot.startsOn} to ${slot.endsOn}`
                : slot.cohort && slot.cohort !== "season"
                  ? "Dates pending — groups can be built now"
                  : "Whole season"}
              {slot.excludedDates.length
                ? ` · ${slot.excludedDates.length} no-lesson dates`
                : ""}
            </span>
            <Link
              to="/admin/programs/$programId"
              params={{ programId: workspace.program.id }}
              className="underline"
            >
              Configure sessions
            </Link>
          </div>
        ) : null;
      })()}
      {!draft && (
        <Card className="border-pm-green/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="text-pm-green size-5" />A head start on your
              groups
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground max-w-2xl text-sm">
              We’ll suggest groups using discipline, age and ability, with
              qualified instructors. Imported registrations use their confirmed
              sessions. Other students use the day and time selected above.
              Adjust every placement before approval.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !timeSlotId}
                onClick={() =>
                  void mutate(
                    () =>
                      createGroupingDraft({
                        data: {
                          programId: workspace.program.id,
                          mode: "suggested",
                          weekday,
                          timeSlotId,
                        },
                      }),
                    "Suggested groups are ready to review.",
                  )
                }
              >
                <Sparkles />
                {busy ? "Creating…" : "Create draft"}
              </Button>
              <Button
                variant="outline"
                disabled={busy || !timeSlotId}
                onClick={() =>
                  void mutate(() =>
                    createGroupingDraft({
                      data: {
                        programId: workspace.program.id,
                        mode: "manual",
                        weekday,
                        timeSlotId,
                      },
                    }),
                  )
                }
              >
                Start with empty groups
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,2fr)]">
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4">
          {selectedStudent && (
            <div className="border-pm-green/30 bg-pm-mist max-h-[26rem] overflow-y-auto rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <strong>
                    {selectedStudent.firstName} {selectedStudent.lastName}
                  </strong>{" "}
                  · Choose a destination group.
                </p>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setSelected(null)}
                >
                  Cancel selection
                </Button>
              </div>
              <h3 className="mt-3 text-xs font-semibold tracking-wide uppercase">
                Placement notes
              </h3>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {selectedStudent.placementNotes || "No placement notes."}
              </p>
              {selectedStudent.survey?.placementNotes && (
                <p className="text-sm whitespace-pre-wrap">
                  Survey: {selectedStudent.survey.placementNotes}
                </p>
              )}
              {selectedStudent.needsSchedule && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    Imported session: {selectedStudent.sourceScheduleLabel}.
                    Confirm as {weekdays[weekday]} ·{" "}
                    {findLabel(workspace.timeSlots, timeSlotId)}?
                  </span>
                  <Button
                    size="sm"
                    disabled={
                      busy || !workspace.capabilities.canEdit || !timeSlotId
                    }
                    onClick={() =>
                      void mutate(
                        () =>
                          saveRegistrationSchedule({
                            data: {
                              registrationId: selectedStudent.registrationId,
                              weekday,
                              timeSlotId,
                              applyToMatching,
                            },
                          }),
                        "Lesson session confirmed.",
                      )
                    }
                  >
                    {applyToMatching
                      ? "Confirm matching sessions"
                      : "Confirm this session"}
                  </Button>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={applyToMatching}
                      onChange={(event) =>
                        setApplyToMatching(event.target.checked)
                      }
                    />
                    Apply to all unplaced students with the same imported
                    session (
                    {
                      workspace.roster.filter(
                        (student) =>
                          student.needsSchedule &&
                          student.sourceScheduleLabel ===
                            selectedStudent.sourceScheduleLabel,
                      ).length
                    }
                    )
                  </label>
                </div>
              )}
              <label className="mt-3 grid gap-1 text-xs font-medium">
                Placement reason (required for mixed levels or age exceptions)
                <Input
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Explain an age-band exception or placement decision…"
                />
              </label>
              {editable && selected?.fromGroupId && (
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void place(null)}
                >
                  Return to needs placement
                </Button>
              )}
            </div>
          )}

          <section
            className="flex h-[34rem] flex-col overflow-hidden rounded-xl border bg-white"
            aria-label="Student pool"
          >
            <div className="border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <UsersRound className="size-4" />
                Students
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Placement counts include every session.
              </p>
              <Input
                aria-label="Find a student"
                placeholder="Find a student…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="mt-3"
              />
              <div className="mt-3 flex flex-wrap gap-1">
                {[
                  ["unplaced", "Needs placement"],
                  ["all", "All"],
                  ["review", "Needs info"],
                ].map(([value, title]) => (
                  <Button
                    key={value}
                    size="xs"
                    variant={rosterView === value ? "default" : "outline"}
                    onClick={() => setRosterView(value!)}
                  >
                    {title}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3">
              {roster.length ? (
                roster.map((student) => studentCard(student))
              ) : (
                <p className="text-muted-foreground p-5 text-sm">
                  {query
                    ? "No students match your search."
                    : rosterView === "unplaced"
                      ? "Everyone is placed. Choose All to browse students and their notes."
                      : "No students in this view."}
                </p>
              )}
            </div>
            <div className="border-t p-3 text-xs">
              <Link
                to="/admin/students"
                className="text-pm-green font-medium underline"
              >
                Open student roster
              </Link>{" "}
              to edit student details.
            </div>
          </section>
          <InstructorOverview
            onRemove={(groupId, instructorId) => {
              const group = workspace.groups.find(
                (item) => item.id === groupId,
              );
              if (!group || !draft || !editable) return;
              void mutate(
                () =>
                  assignDraftInstructor({
                    data: {
                      draftId: draft.id,
                      baseVersion: draft.version,
                      commandId: crypto.randomUUID(),
                      groupId,
                      instructorIds: group.instructorIds.filter(
                        (id) => id !== instructorId,
                      ),
                      leadInstructorId:
                        group.leadInstructorId === instructorId
                          ? null
                          : group.leadInstructorId,
                    },
                  }),
                "Instructor removed from group.",
              );
            }}
            groupName={groupName}
            workspace={workspace}
            weekday={weekday}
            timeSlotId={timeSlotId}
          />
        </aside>
        <section
          className="flex min-w-0 flex-col gap-4"
          aria-label="Lesson groups"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {weekdays[weekday]} ·{" "}
              {findLabel(workspace.timeSlots, timeSlotId) ?? "Select a time"}
            </h2>
            <span className="text-muted-foreground text-xs">
              {groups.length} groups in view
            </span>
          </div>
          <div className="space-y-4">
            {lanes.map((lane) => (
              <section
                key={lane.key}
                className="overflow-hidden rounded-xl border bg-white"
                aria-label={[
                  findLabel(
                    workspace.disciplines,
                    lane.groups[0]!.disciplineId,
                  ),
                  findLabel(workspace.ageBands, lane.groups[0]!.ageBandId),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <header className="bg-pm-mist/60 flex items-center justify-between gap-3 border-b px-4 py-3">
                  <h3 className="font-semibold">
                    {[
                      findLabel(
                        workspace.disciplines,
                        lane.groups[0]!.disciplineId,
                      ),
                      findLabel(workspace.ageBands, lane.groups[0]!.ageBandId),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </h3>
                  <span className="text-muted-foreground text-xs">
                    {lane.groups.length} groups · scroll to browse
                  </span>
                </header>
                <div
                  className="grid max-h-[38rem] auto-rows-max grid-cols-1 content-start items-start gap-3 overflow-y-auto overscroll-contain bg-stone-50/60 p-3 xl:h-[34rem] xl:grid-cols-2 2xl:grid-cols-3"
                  tabIndex={0}
                  aria-label="Scrollable groups"
                >
                  {lane.groups.map((group) => {
                    const students = workspace.assignments
                      .filter((row) => row.draftGroupId === group.id)
                      .flatMap((row) => {
                        const student = workspace.roster.find(
                          (item) => item.registrationId === row.registrationId,
                        );
                        return student ? [student] : [];
                      });
                    const lead = workspace.instructors.find(
                      (instructor) => instructor.id === group.leadInstructorId,
                    );
                    const staffing = staffingGuidance(
                      students.length,
                      group.instructorIds,
                      group.leadInstructorId,
                    );
                    const wrongSession =
                      selectedStudent?.schedule &&
                      (selectedStudent.schedule.weekday !== group.weekday ||
                        selectedStudent.schedule.timeSlotId !==
                          group.timeSlotId);
                    const wrongDiscipline =
                      selectedStudent?.disciplineId &&
                      selectedStudent.disciplineId !== group.disciplineId;
                    const canPlace =
                      editable &&
                      selected &&
                      selected.fromGroupId !== group.id &&
                      !selectedStudent?.needsSchedule &&
                      selectedStudent?.registrationStatus === "active" &&
                      !wrongSession &&
                      !wrongDiscipline;
                    return (
                      <Card
                        key={group.id}
                        onDragOver={(event) => {
                          if (editable) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (!editable) return;
                          const instructorId = event.dataTransfer.getData(
                            "application/carve-instructor",
                          );
                          if (instructorId) {
                            void assignLead(group, instructorId);
                            return;
                          }
                          const raw = event.dataTransfer.getData(
                            "application/carve-student",
                          );
                          if (!raw) return;
                          try {
                            const payload = JSON.parse(raw) as {
                              registrationId: string;
                              fromGroupId: string | null;
                            };
                            void mutate(
                              () =>
                                moveRegistration({
                                  data: {
                                    ...payload,
                                    draftId: draft.id,
                                    baseVersion: draft.version,
                                    commandId: crypto.randomUUID(),
                                    groupId: group.id,
                                    overrideReason: overrideReason || undefined,
                                  },
                                }),
                              "Student moved.",
                            );
                          } catch {
                            setError("Could not read the dragged student.");
                          }
                        }}
                        className={cn(
                          "gap-0 overflow-hidden py-0",
                          canPlace && "border-pm-green/50",
                        )}
                      >
                        <CardHeader className="gap-2 border-b p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle role="heading" aria-level={3}>
                                {groupName(group.id)}
                              </CardTitle>
                            </div>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label={`Edit ${groupName(group.id)}`}
                              onClick={() => setEditingGroupId(group.id)}
                            >
                              <Settings2 />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span
                              draggable={editable && Boolean(lead)}
                              onDragStart={(event) => {
                                if (lead) {
                                  event.dataTransfer.setData(
                                    "application/carve-instructor",
                                    lead.id,
                                  );
                                  event.dataTransfer.setData(
                                    "application/carve-from-group",
                                    group.id,
                                  );
                                }
                              }}
                              className={
                                lead ? "text-pm-green" : "text-amber-800"
                              }
                            >
                              <GraduationCap className="mr-1 inline size-4" />
                              {lead
                                ? `${lead.firstName} ${lead.lastName}`
                                : "No lead instructor"}
                            </span>
                            <span>
                              {students.length} students ·{" "}
                              {staffing.instructors} instructors
                            </span>
                          </div>
                          {editable && (
                            <label className="text-xs">
                              Suggested lead
                              <select
                                aria-label={
                                  "Suggested lead for " + groupName(group.id)
                                }
                                value={group.leadInstructorId ?? ""}
                                onChange={(event) =>
                                  void assignLead(
                                    group,
                                    event.target.value || null,
                                  )
                                }
                              >
                                <option value="">No lead instructor</option>
                                {instructorCandidates(group).map((item) => (
                                  <option
                                    key={item.instructor.id}
                                    value={item.instructor.id}
                                  >
                                    {item.instructor.firstName}{" "}
                                    {item.instructor.lastName} · {item.reason}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {staffing.message && (
                            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                              {staffing.message}
                            </p>
                          )}
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2 p-3">
                          {students.map((student) => (
                            <div
                              key={student.registrationId}
                              className="flex gap-2"
                            >
                              {editable && (
                                <input
                                  type="checkbox"
                                  aria-label={
                                    "Select " + student.firstName + " for split"
                                  }
                                  checked={splitSelection.includes(
                                    student.registrationId,
                                  )}
                                  onChange={(event) =>
                                    setSplitSelection((previous) =>
                                      event.target.checked
                                        ? [...previous, student.registrationId]
                                        : previous.filter(
                                            (id) =>
                                              id !== student.registrationId,
                                          ),
                                    )
                                  }
                                />
                              )}
                              {studentCard(student, group.id)}
                            </div>
                          ))}
                          {editable && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                busy ||
                                !students.some((student) =>
                                  splitSelection.includes(
                                    student.registrationId,
                                  ),
                                )
                              }
                              onClick={() =>
                                mutate(async () => {
                                  await splitGroup({
                                    data: {
                                      draftId: draft.id,
                                      baseVersion: draft.version,
                                      commandId: crypto.randomUUID(),
                                      groupId: group.id,
                                      registrationIds: students
                                        .filter((student) =>
                                          splitSelection.includes(
                                            student.registrationId,
                                          ),
                                        )
                                        .map(
                                          (student) => student.registrationId,
                                        ),
                                    },
                                  });
                                  setSplitSelection([]);
                                }, "Selected students split into a new unstaffed group.")
                              }
                            >
                              Split selected into new group
                            </Button>
                          )}
                          {!students.length && (
                            <p className="text-muted-foreground rounded-lg border border-dashed p-5 text-center text-xs">
                              Select a student to add them here.
                            </p>
                          )}
                          {selected && (
                            <Button
                              size="sm"
                              variant={canPlace ? "default" : "outline"}
                              disabled={busy || !canPlace}
                              onClick={() => void place(group.id)}
                            >
                              <ArrowRight />
                              {wrongSession
                                ? "Different session"
                                : wrongDiscipline
                                  ? "Different discipline"
                                  : "Place student here"}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
            {!groups.length && (
              <div className="rounded-xl border border-dashed p-10 text-center md:col-span-2">
                <UsersRound className="text-pm-green mx-auto mb-3 size-7" />
                <h3 className="font-medium">
                  No groups in this day and time slot.
                </h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  Choose another session
                  {draft
                    ? " or add a new group."
                    : " or create suggested groups above."}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      {workspace.rebuildHistory.length > 0 && (
        <details className="rounded-xl border bg-white p-4">
          <summary className="font-semibold">Previous rebuild layouts</summary>
          {workspace.rebuildHistory.map((operation) => (
            <section key={operation.id} className="mt-3 border-t pt-3">
              <h3>
                {new Date(operation.createdAt).toLocaleString()} ·{" "}
                {operation.scope === "program"
                  ? "Whole program"
                  : "Visible session"}
              </h3>
              {operation.groups.map((group) => (
                <article key={group.id} className="mt-2 text-sm">
                  <strong>{group.description}</strong>
                  <p>
                    {group.registrationIds
                      .map((id) => {
                        const person = workspace.roster.find(
                          (row) => row.registrationId === id,
                        );
                        return person
                          ? `${person.firstName} ${person.lastName}`
                          : "Former registration";
                      })
                      .join(", ")}
                  </p>
                  {group.notes && (
                    <p className="whitespace-pre-wrap">
                      Group notes: {group.notes}
                    </p>
                  )}
                </article>
              ))}
            </section>
          ))}
        </details>
      )}
      {draft && (
        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
          <div>
            <p className="text-sm font-medium">
              {unplaced.length === 0 && missingLeads === 0
                ? "Ready for a final review"
                : `${unplaced.length} students need placement · ${missingLeads} groups need a lead`}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Draft version {draft.version}. Publishing creates the recurring
              lesson schedule.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspace.capabilities.canUndo && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void mutate(() =>
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
                <Undo2 />
                Undo last move
              </Button>
            )}
            {editable && (
              <Button
                disabled={busy || !workspace.groups.length}
                onClick={() =>
                  void mutate(
                    () =>
                      submitGroupingDraft({
                        data: { draftId: draft.id, baseVersion: draft.version },
                      }),
                    "Submitted for administrator approval.",
                  )
                }
              >
                Submit for approval
              </Button>
            )}
            {workspace.capabilities.canApprove &&
              ["submitted", "approved"].includes(draft.status) &&
              !draft.finalizedSnapshot && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      () =>
                        returnGroupingDraft({
                          data: {
                            draftId: draft.id,
                            baseVersion: draft.version,
                          },
                        }),
                      "Draft returned for changes.",
                    )
                  }
                >
                  Return for changes
                </Button>
              )}
            {draft.status === "submitted" &&
              workspace.capabilities.canApprove && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void mutate(() =>
                      approveGroupingDraft({
                        data: { draftId: draft.id, baseVersion: draft.version },
                      }),
                    )
                  }
                >
                  Finalize student placements
                </Button>
              )}
            {draft.status === "approved" &&
              workspace.capabilities.canApprove && (
                <Button
                  disabled={busy || missingLeads > 0}
                  onClick={() => setConfirm("publish")}
                >
                  Publish groups
                </Button>
              )}
          </div>
        </footer>
      )}
      <Sheet
        open={Boolean(editingGroup)}
        onOpenChange={(open) => {
          if (!open) setEditingGroupId(null);
        }}
      >
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {editingGroup ? groupName(editingGroup.id) : "Group details"}
            </SheetTitle>
            <SheetDescription>
              Set the lesson details and choose qualified instructors.
            </SheetDescription>
          </SheetHeader>
          {editingGroup && draft && (
            <div className="flex flex-col gap-6 p-4">
              <GroupConfiguration
                key={`${editingGroup.id}:${draft.version}:details`}
                group={editingGroup}
                workspace={workspace}
                busy={busy}
                readOnly={!editable}
                onDelete={() => setConfirm("delete")}
                onSave={(values) =>
                  void mutate(() =>
                    updateDraftGroup({
                      data: {
                        ...values,
                        draftId: draft.id,
                        baseVersion: draft.version,
                        commandId: crypto.randomUUID(),
                        groupId: editingGroup.id,
                      },
                    }),
                  )
                }
              />
              <InstructorConfiguration
                key={`${editingGroup.id}:${draft.version}:staff`}
                group={editingGroup}
                instructors={workspace.instructors.filter(
                  (instructor) =>
                    !editingGroup.disciplineId ||
                    instructor.disciplineIds.includes(
                      editingGroup.disciplineId,
                    ),
                )}
                busy={busy}
                readOnly={!editable}
                onSave={(instructorIds, leadInstructorId) =>
                  void mutate(() =>
                    assignDraftInstructor({
                      data: {
                        draftId: draft.id,
                        baseVersion: draft.version,
                        commandId: crypto.randomUUID(),
                        groupId: editingGroup.id,
                        instructorIds,
                        leadInstructorId,
                      },
                    }),
                  )
                }
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "publish"
                ? "Publish these lesson groups?"
                : "Delete this draft group?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "publish"
                ? `${workspace.groups.length} groups will become the recurring lesson schedule. ${unplaced.length} students remain unplaced. Review every session before publishing.`
                : "Its students will return to Needs placement."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                if (!draft) return;
                if (confirm === "publish")
                  void mutate(
                    () =>
                      publishGroupingDraft({
                        data: {
                          draftId: draft.id,
                          idempotencyKey: crypto.randomUUID(),
                        },
                      }),
                    "Groups published.",
                  );
                else if (editingGroup)
                  void mutate(() =>
                    deleteDraftGroup({
                      data: {
                        draftId: draft.id,
                        baseVersion: draft.version,
                        commandId: crypto.randomUUID(),
                        groupId: editingGroup.id,
                      },
                    }),
                  ).then((saved) => {
                    if (saved) setEditingGroupId(null);
                  });
              }}
            >
              {confirm === "publish" ? "Publish groups" : "Delete group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Picker({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Array<{ id: string; label: string }>;
}) {
  return (
    <label className="grid min-w-36 gap-1 text-xs font-medium">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function InstructorOverview({
  onRemove,
  groupName,
  workspace,
  weekday,
  timeSlotId,
}: {
  workspace: Workspace;
  onRemove: (groupId: string, instructorId: string) => void;
  groupName: (id: string) => string;
  weekday: number;
  timeSlotId: string;
}) {
  const [search, setSearch] = useState("");
  const slot = workspace.timeSlots.find((item) => item.id === timeSlotId);
  return (
    <section
      className="flex h-[24rem] flex-col rounded-xl border bg-white p-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const from = event.dataTransfer.getData("application/carve-from-group");
        const instructor = event.dataTransfer.getData(
          "application/carve-instructor",
        );
        if (from && instructor) onRemove(from, instructor);
      }}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <GraduationCap className="size-4" />
        Instructors for this session
      </h2>
      <Input
        className="mt-3"
        aria-label="Search instructor pool"
        placeholder="Search instructors"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
        {workspace.instructors
          .filter((instructor) =>
            `${instructor.firstName} ${instructor.lastName}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((instructor) => {
            const assigned = workspace.groups.filter((group) => {
              const other = workspace.timeSlots.find(
                (item) => item.id === group.timeSlotId,
              );
              return (
                group.weekday === weekday &&
                group.instructorIds.includes(instructor.id) &&
                Boolean(slot && other && sessionsOverlap(slot, other, weekday))
              );
            });
            return (
              <div
                key={instructor.id}
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    "application/carve-instructor",
                    instructor.id,
                  )
                }
                className="rounded-lg border px-3 py-2 text-xs"
              >
                <p className="font-medium">
                  {instructor.firstName} {instructor.lastName}
                </p>
                <p className="text-muted-foreground mt-1">
                  {assigned.length
                    ? assigned.map((group) => groupName(group.id)).join(", ")
                    : instructor.disciplineIds.length
                      ? "Not assigned this session"
                      : "Qualifications needed"}
                </p>
              </div>
            );
          })}
        {!workspace.instructors.length && (
          <Link to="/admin/instructors" className="text-sm underline">
            Add instructors and qualifications
          </Link>
        )}
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        Suggestions use recorded availability and teaching preferences. Drag an
        assigned instructor back here to remove them, or use the group’s
        instructor controls.
      </p>
    </section>
  );
}
