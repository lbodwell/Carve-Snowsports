import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type { Workspace } from "./group-building-workspace";
import type { GroupChangeAction } from "@/domain/grouping/group-lifecycle";
import { staffingGuidance } from "@/domain/grouping/staffing-ratio";
import { descriptiveGroupLabel } from "@/domain/grouping/group-label";
import {
  getLifecycle,
  requestGroupChange,
  reviewGroupChange,
} from "@/server/functions/group-lifecycle";
import { Button } from "@/components/ui/button";

export function GroupLifecyclePanel({ workspace }: { workspace: Workspace }) {
  const router = useRouter();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getLifecycle>
  > | null>(null);
  const [asOf, setAsOf] = useState("");
  const [student, setStudent] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<GroupChangeAction["type"]>("move");
  const [source, setSource] = useState("");
  const draft = workspace.draft!;
  useEffect(() => {
    let active = true;
    getLifecycle({
      data: {
        draftId: draft.id,
        asOf: asOf || undefined,
        studentId: student || undefined,
      },
    })
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active)
          setMessage(
            error instanceof Error ? error.message : "Could not load history.",
          );
      });
    return () => {
      active = false;
    };
  }, [draft.id, draft.version, asOf, student]);
  const label = (id: string) => {
    const group = data?.groups.find((item) => item.id === id);
    if (!group) return "Historical group";
    if (group.description) return group.description;
    const lead = workspace.instructors.find(
      (item) => item.id === group.leadInstructorId,
    );
    return descriptiveGroupLabel({
      discipline: workspace.disciplines.find(
        (item) => item.id === group.disciplineId,
      )?.label,
      ageBand: workspace.ageBands.find((item) => item.id === group.ageBandId)
        ?.label,
      level: workspace.abilityLevels.find(
        (item) => item.id === group.abilityLevelId,
      )?.label,
      ordinal: group.displayOrdinal,
      duplicate: true,
      instructor: lead ? `${lead.firstName} ${lead.lastName}` : null,
    });
  };
  const sourceGroup = data?.groups.find((group) => group.id === source);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await router.invalidate();
      setData(
        await getLifecycle({
          data: {
            draftId: draft.id,
            asOf: asOf || undefined,
            studentId: student || undefined,
          },
        }),
      );
      setMessage("Change recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Change failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border bg-white p-4">
      <h2 className="text-xl font-semibold">
        Finalized placements and history
      </h2>
      <div className="flex flex-wrap gap-3">
        <label>
          View as of
          <input
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
          />
        </label>
        <label>
          Student timeline
          <select
            value={student}
            onChange={(event) => setStudent(event.target.value)}
          >
            <option value="">All students</option>
            {workspace.roster.map((row) => (
              <option key={row.registrationId} value={row.studentId}>
                {row.firstName} {row.lastName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {data?.groups.map((group) => (
          <article key={group.id} className="rounded border p-3">
            <h3 className="font-medium">
              {label(group.id)}
              {group.closed ? " · Closed" : ""}
            </h3>
            {staffingGuidance(
              group.registrationIds.length,
              group.instructorIds,
              group.leadInstructorId,
            ).message && (
              <p className="mt-2 text-xs text-amber-800">
                {
                  staffingGuidance(
                    group.registrationIds.length,
                    group.instructorIds,
                    group.leadInstructorId,
                  ).message
                }
              </p>
            )}
            <p>
              {group.registrationIds
                .map((id) => {
                  const row = workspace.roster.find(
                    (item) => item.registrationId === id,
                  );
                  return row
                    ? `${row.firstName} ${row.lastName}`
                    : "Former registration";
                })
                .join(", ") || "No students"}
            </p>
          </article>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const value = (name: string) => String(form.get(name) ?? "");
          if (!sourceGroup || !data) return;
          const action: GroupChangeAction =
            kind === "closure"
              ? {
                  type: "closure",
                  groupId: source,
                  closed: !sourceGroup.closed,
                }
              : kind === "move"
                ? {
                    type: "move",
                    fromGroupId: source,
                    toGroupId: value("destination"),
                    registrationId: value("registration"),
                  }
                : kind === "staff"
                  ? {
                      type: "staff",
                      groupId: source,
                      leadInstructorId: value("instructor") || null,
                      instructorIds: [
                        ...new Set([
                          ...form.getAll("instructors").map(String),
                          ...(value("instructor") ? [value("instructor")] : []),
                        ]),
                      ],
                    }
                  : kind === "split"
                    ? {
                        type: "split",
                        groupId: source,
                        newGroupId: crypto.randomUUID(),
                        registrationIds: form.getAll("members").map(String),
                        leadInstructorId: value("instructor") || null,
                        instructorIds: [
                          ...new Set([
                            ...form.getAll("instructors").map(String),
                            ...(value("instructor")
                              ? [value("instructor")]
                              : []),
                          ]),
                        ],
                      }
                    : {
                        type: "details",
                        groupId: source,
                        disciplineId: value("discipline"),
                        abilityLevelId: value("level") || null,
                        ageBandId: value("ageBand") || null,
                        weekday: Number(value("weekday")),
                        timeSlotId: value("timeSlot"),
                        notes: value("notes"),
                      };
          void run(() =>
            requestGroupChange({
              data: {
                draftId: draft.id,
                baseVersion: data.version,
                commandId: crypto.randomUUID(),
                action,
                reason: value("reason"),
                effectiveFrom: value("from"),
                effectiveUntil: value("until") || null,
              },
            }),
          );
        }}
      >
        <label>
          Change
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as GroupChangeAction["type"])
            }
          >
            <option value="move">Move student</option>
            <option value="staff">Change instructors</option>
            <option value="details">Change group details</option>
            <option value="split">Split group</option>
            <option value="closure">Close / reopen empty group</option>
          </select>
        </label>
        <label>
          Group
          <select
            required
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="">Choose group</option>
            {data?.groups
              .filter((group) => kind === "closure" || !group.closed)
              .map((group) => (
                <option key={group.id} value={group.id}>
                  {label(group.id)}
                </option>
              ))}
          </select>
        </label>
        {kind === "move" && (
          <>
            <label>
              Student
              <select required name="registration">
                {sourceGroup?.registrationIds.map((id) => {
                  const row = workspace.roster.find(
                    (item) => item.registrationId === id,
                  );
                  return (
                    <option key={id} value={id}>
                      {row?.firstName} {row?.lastName}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Destination
              <select name="destination" required>
                {data?.groups
                  .filter((group) => group.id !== source)
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {label(group.id)}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {(kind === "staff" || kind === "split") && (
          <label>
            Lead instructor
            <select
              key={source + kind}
              name="instructor"
              defaultValue={
                kind === "staff" ? (sourceGroup?.leadInstructorId ?? "") : ""
              }
            >
              <option value="">Unstaffed</option>
              {workspace.instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.firstName} {instructor.lastName}
                </option>
              ))}
            </select>
          </label>
        )}
        {(kind === "staff" || kind === "split") && (
          <fieldset key={source + kind} className="rounded border p-2">
            <legend>Additional instructors</legend>
            {workspace.instructors
              .filter((person) => person.id !== sourceGroup?.leadInstructorId)
              .map((person) => (
                <label
                  key={person.id}
                  className="mr-3 inline-flex items-center gap-1"
                >
                  <input
                    name="instructors"
                    type="checkbox"
                    value={person.id}
                    defaultChecked={
                      kind === "staff" &&
                      sourceGroup?.instructorIds.includes(person.id)
                    }
                  />
                  {person.firstName} {person.lastName}
                </label>
              ))}
          </fieldset>
        )}
        {kind === "split" &&
          sourceGroup?.registrationIds.map((id) => {
            const row = workspace.roster.find(
              (item) => item.registrationId === id,
            );
            return (
              <label key={id}>
                <input name="members" type="checkbox" value={id} />
                {row?.firstName} {row?.lastName}
              </label>
            );
          })}
        {kind === "details" && sourceGroup && (
          <div key={source} className="flex flex-wrap gap-2">
            <label>
              Discipline
              <select
                name="discipline"
                defaultValue={sourceGroup.disciplineId ?? ""}
              >
                {workspace.disciplines.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Level
              <select
                name="level"
                defaultValue={sourceGroup.abilityLevelId ?? ""}
              >
                {workspace.abilityLevels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Age band
              <select name="ageBand" defaultValue={sourceGroup.ageBandId ?? ""}>
                {workspace.ageBands.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Day
              <select name="weekday" defaultValue={sourceGroup.weekday}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Time
              <select name="timeSlot" defaultValue={sourceGroup.timeSlotId}>
                {workspace.timeSlots.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea name="notes" defaultValue={sourceGroup.notes ?? ""} />
            </label>
          </div>
        )}
        <label>
          Effective from
          <input required type="date" name="from" />
        </label>
        <label>
          Through (blank = ongoing)
          <input type="date" name="until" />
        </label>
        <label>
          Reason
          <input name="reason" required maxLength={2000} />
        </label>
        <Button disabled={busy || !sourceGroup} type="submit">
          {data?.canApprove ? "Apply audited change" : "Propose change"}
        </Button>
      </form>
      {message && <p role="status">{message}</p>}
      <h3 className="font-semibold">Change timeline and pending proposals</h3>
      {data?.changes.map((change) => (
        <article key={change.id} className="rounded border p-3">
          <p>
            <strong>
              {change.action.type === "move"
                ? "Student move"
                : change.action.type === "staff"
                  ? "Staffing change"
                  : change.action.type === "split"
                    ? "Group split"
                    : "Group details"}
            </strong>{" "}
            · {change.status} · {change.effectiveFrom}
            {change.effectiveUntil
              ? ` through ${change.effectiveUntil}; underlying placement resumes afterward`
              : " onward"}
          </p>
          <p>{change.reason}</p>
          <details>
            <summary>Placement before and after</summary>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["before", "after"] as const).map((stage) => (
                <div key={stage}>
                  <strong>{stage === "before" ? "Before" : "After"}</strong>
                  {change[stage]?.map((group) => (
                    <p key={group.id}>
                      {group.description ?? "Historical group"} ·{" "}
                      {group.registrationIds
                        .map((id) => {
                          const member = workspace.roster.find(
                            (row) => row.registrationId === id,
                          );
                          return member
                            ? `${member.firstName} ${member.lastName}`
                            : "Former student";
                        })
                        .join(", ") || "No members"}
                      {group.closed ? " · Closed" : ""}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </details>
          <p className="text-muted-foreground text-xs">
            Recorded {new Date(change.createdAt).toLocaleString()} · actor{" "}
            {data.actors.find((actor) => actor.id === change.actorId)?.name ??
              "Former staff member"}
            {change.approvedBy
              ? ` · reviewed by ${data.actors.find((actor) => actor.id === change.approvedBy)?.name ?? "Former staff member"}`
              : ""}
          </p>
          {change.status === "pending" && data.canApprove && (
            <div className="flex gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  run(() =>
                    reviewGroupChange({
                      data: { changeId: change.id, approve: true },
                    }),
                  )
                }
              >
                Approve
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    reviewGroupChange({
                      data: { changeId: change.id, approve: false },
                    }),
                  )
                }
              >
                Reject
              </Button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
