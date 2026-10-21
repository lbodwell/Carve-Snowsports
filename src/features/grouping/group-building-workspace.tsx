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
import {
  GroupConfiguration,
  InstructorConfiguration,
} from "./grouping-editors";
import type { getGroupingWorkspace } from "@/server/functions/grouping-draft";
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
  returnGroupingDraft,
  saveRegistrationSchedule,
  submitGroupingDraft,
  suggestRemainingDraftPlacements,
  undoDraftOperation,
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
}: {
  workspace: Workspace;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [weekday, setWeekday] = useState(workspace.groups[0]?.weekday ?? 6);
  const [timeSlotId, setTimeSlotId] = useState(
    workspace.groups[0]?.timeSlotId ?? workspace.timeSlots[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [rosterView, setRosterView] = useState("unplaced");
  const [selected, setSelected] = useState<{
    registrationId: string;
    fromGroupId?: string;
  } | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
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
      group.weekday === weekday &&
      group.timeSlotId === timeSlotId &&
      (discipline === "all" || group.disciplineId === discipline),
  );
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
    (group) => !group.leadInstructorId,
  ).length;
  const groupName = (id: string) =>
    `Group ${workspace.groups.findIndex((group) => group.id === id) + 1}`;
  const roster = workspace.roster.filter(
    (student) =>
      `${student.firstName} ${student.lastName}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (discipline === "all" || student.disciplineId === discipline) &&
      (rosterView !== "unplaced" ||
        (student.registrationStatus === "active" &&
          !assignedIds.has(student.registrationId))) &&
      (rosterView !== "review" ||
        student.registrationStatus !== "active" ||
        student.needsSchedule ||
        !student.dateOfBirth ||
        !student.abilityLevelId),
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
      setSelected(null);
  }
  function studentCard(student: Student, fromGroupId?: string) {
    const active =
      selected?.registrationId === student.registrationId &&
      selected.fromGroupId === fromGroupId;
    const placedElsewhere =
      !fromGroupId && assignedIds.has(student.registrationId);
    return (
      <button
        key={student.registrationId}
        type="button"
        disabled={(!editable && Boolean(draft)) || busy || placedElsewhere}
        aria-pressed={active}
        onClick={() => {
          setApplyToMatching(false);
          setOverrideReason("");
          setSelected(
            active
              ? null
              : { registrationId: student.registrationId, fromGroupId },
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
          {findLabel(workspace.disciplines, student.disciplineId) ??
            "Discipline needed"}{" "}
          ·{" "}
          {findLabel(workspace.abilityLevels, student.abilityLevelId) ??
            "Level needed"}
        </span>
        <span className="text-muted-foreground mt-1 block text-xs">
          {student.dateOfBirth
            ? `Age ${computeAgeOnDate(student.dateOfBirth, workspace.program.seasonStartsOn)}`
            : "Birthdate needed"}
          {student.survey
            ? ` · Survey: ${student.survey.level.replace("level-", "level ")}`
            : " · No linked survey"}
        </span>
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
            Placed · select their card in the group to move
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
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
            <Link to="/admin/surveys">Review surveys</Link>
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
          items={weekdays.map((day, index) => ({
            id: String(index),
            label: day,
          }))}
        />
        <Picker
          label="Time"
          value={timeSlotId}
          onChange={(value) => {
            setTimeSlotId(value);
            setSelected(null);
          }}
          items={workspace.timeSlots.map((slot) => ({
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
      <div className="grid items-start gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border bg-white xl:sticky xl:top-4">
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
          <div className="flex max-h-[38rem] flex-col gap-2 overflow-y-auto p-3">
            {roster.length ? (
              roster.map((student) => studentCard(student))
            ) : (
              <p className="text-muted-foreground p-5 text-sm">
                {query
                  ? "No students match your search."
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
        </aside>
        <section
          className="flex min-w-0 flex-col gap-4"
          aria-label="Lesson groups"
        >
          {selectedStudent && (
            <div className="border-pm-green/30 bg-pm-mist rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <strong>
                    {selectedStudent.firstName} {selectedStudent.lastName}
                  </strong>{" "}
                  · Choose a group below.
                </p>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setSelected(null)}
                >
                  Cancel selection
                </Button>
              </div>
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
                Placement note (optional)
                <Input
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Explain an age-band exception or placement decision…"
                />
              </label>
              {selected?.fromGroupId && (
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
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {weekdays[weekday]} ·{" "}
              {findLabel(workspace.timeSlots, timeSlotId) ?? "Select a time"}
            </h2>
            <span className="text-muted-foreground text-xs">
              {groups.length} groups in view
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {groups.map((group) => {
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
              const full = students.length >= workspace.maximumStudentsPerGroup;
              const wrongSession =
                selectedStudent?.schedule &&
                (selectedStudent.schedule.weekday !== group.weekday ||
                  selectedStudent.schedule.timeSlotId !== group.timeSlotId);
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
                !wrongDiscipline &&
                !full;
              return (
                <Card
                  key={group.id}
                  className={cn(
                    "gap-0 overflow-hidden py-0",
                    canPlace && "border-pm-green/50",
                  )}
                >
                  <CardHeader className="bg-pm-mist/40 gap-3 border-b p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle role="heading" aria-level={3}>
                          {groupName(group.id)}
                        </CardTitle>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {findLabel(workspace.disciplines, group.disciplineId)}{" "}
                          ·{" "}
                          {findLabel(
                            workspace.abilityLevels,
                            group.abilityLevelId,
                          ) ?? "Mixed levels"}{" "}
                          ·{" "}
                          {findLabel(workspace.ageBands, group.ageBandId) ??
                            "All ages"}
                        </p>
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
                        className={lead ? "text-pm-green" : "text-amber-800"}
                      >
                        <GraduationCap className="mr-1 inline size-4" />
                        {lead
                          ? `${lead.firstName} ${lead.lastName}`
                          : "Choose a lead instructor"}
                      </span>
                      <span>
                        {students.length}/{workspace.maximumStudentsPerGroup}
                      </span>
                    </div>
                    <div className="bg-pm-green/10 h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "bg-pm-green h-full",
                          full && "bg-amber-600",
                        )}
                        style={{
                          width: `${Math.min(100, (students.length / workspace.maximumStudentsPerGroup) * 100)}%`,
                        }}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 p-3">
                    {students.map((student) => studentCard(student, group.id))}
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
                        {full
                          ? "Group full"
                          : wrongSession
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
          <InstructorOverview
            workspace={workspace}
            weekday={weekday}
            timeSlotId={timeSlotId}
          />
        </section>
      </div>
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
              ["submitted", "approved"].includes(draft.status) && (
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
                  Approve draft
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
  workspace,
  weekday,
  timeSlotId,
}: {
  workspace: Workspace;
  weekday: number;
  timeSlotId: string;
}) {
  const slot = workspace.timeSlots.find((item) => item.id === timeSlotId);
  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <GraduationCap className="size-4" />
        Instructors for this session
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {workspace.instructors.map((instructor) => {
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
              className="rounded-lg border px-3 py-2 text-xs"
            >
              <p className="font-medium">
                {instructor.firstName} {instructor.lastName}
              </p>
              <p className="text-muted-foreground mt-1">
                {assigned.length
                  ? assigned
                      .map(
                        (group) =>
                          `Group ${workspace.groups.findIndex((item) => item.id === group.id) + 1}`,
                      )
                      .join(", ")
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
        Availability reflects draft assignments. Confirm staff working hours
        with your team.
      </p>
    </section>
  );
}
