import { and, asc, eq, gte, inArray, lte, max } from "drizzle-orm";
import { z } from "zod";
import { describeGroups } from "./group-description.server";
import type { Actor } from "@/application/policies/authorization";
import type { LifecycleGroup } from "@/domain/grouping/group-lifecycle";
import { requirePermission } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { db } from "@/db/client.server";
import {
  abilityLevels,
  ageBands,
  auditEvents,
  disciplines,
  groupChangeRequests,
  groupRecurrences,
  groupRevisionMemberships,
  groupRevisions,
  groupingDraftAssignments,
  groupingDraftGroups,
  groupingDraftInstructors,
  groupingDrafts,
  instructorQualifications,
  instructors,
  lessonAttendance,
  lessonInstances,
  organizations,
  people,
  programs,
  registrations,
  seasonGroups,
  seasons,
  timeSlots,
  users,
} from "@/db/schema";
import {
  groupChangeActionSchema,
  groupsAsOf,
  lifecycleBoundaries,
  nextDate,
} from "@/domain/grouping/group-lifecycle";
import { instructorAvailability } from "@/domain/grouping/instructor-preferences";
import {
  sessionLessons,
  sessionsOverlap,
} from "@/domain/calendar/session-calendar";
import { resolveRegistrationSchedule } from "@/domain/grouping/registration-schedule";
import { rangesOverlap } from "@/domain/calendar/time-ranges";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function captureGroupingSnapshot(
  tx: Tx,
  draftId: string,
): Promise<Array<LifecycleGroup>> {
  const groups = await tx
    .select()
    .from(groupingDraftGroups)
    .where(eq(groupingDraftGroups.draftId, draftId));
  const members = await tx
    .select()
    .from(groupingDraftAssignments)
    .where(eq(groupingDraftAssignments.draftId, draftId));
  const staff = groups.length
    ? await tx
        .select()
        .from(groupingDraftInstructors)
        .where(
          inArray(
            groupingDraftInstructors.draftGroupId,
            groups.map((group) => group.id),
          ),
        )
    : [];
  const [draft] = await tx
    .select({ programId: groupingDrafts.programId })
    .from(groupingDrafts)
    .where(eq(groupingDrafts.id, draftId));
  return describeGroups(
    tx,
    draft!.programId,
    groups.map((group) => ({
      id: group.id,
      disciplineId: group.disciplineId,
      ageBandId: group.ageBandId,
      abilityLevelId: group.abilityLevelId,
      weekday: group.weekday,
      timeSlotId: group.timeSlotId,
      notes: group.notes,
      leadInstructorId: group.leadInstructorId,
      displayOrdinal: group.displayOrdinal,
      instructorIds: staff
        .filter((item) => item.draftGroupId === group.id)
        .map((item) => item.instructorId),
      registrationIds: members
        .filter((item) => item.draftGroupId === group.id)
        .map((item) => item.registrationId),
    })),
  );
}
async function context(tx: Tx | typeof db, actor: Actor, draftId: string) {
  const [row] = await tx
    .select({
      draft: groupingDrafts,
      season: seasons,
      timezone: organizations.timezone,
    })
    .from(groupingDrafts)
    .innerJoin(programs, eq(programs.id, groupingDrafts.programId))
    .innerJoin(seasons, eq(seasons.id, programs.seasonId))
    .innerJoin(organizations, eq(organizations.id, seasons.organizationId))
    .where(
      and(
        eq(groupingDrafts.id, draftId),
        eq(seasons.organizationId, actor.organizationId),
      ),
    );
  if (!row)
    throw new ApplicationError("NOT_FOUND", "Grouping workspace not found.");
  return row;
}
const localToday = (timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export async function validateLifecycleSnapshot(
  tx: Tx,
  programId: string,
  groups: Array<LifecycleGroup>,
  published: boolean,
  effectiveFrom: string,
  effectiveUntil: string,
  ownedGroupIds = groups.map((group) => group.id),
) {
  const slots = await tx
    .select()
    .from(timeSlots)
    .where(eq(timeSlots.programId, programId));
  const enrollment = await tx
    .select({ registration: registrations, person: people })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.studentId))
    .where(eq(registrations.programId, programId));
  const staffIds = [...new Set(groups.flatMap((group) => group.instructorIds))];
  const staff = staffIds.length
    ? await tx
        .select({ instructor: instructors, archivedAt: people.archivedAt })
        .from(instructors)
        .innerJoin(people, eq(people.id, instructors.personId))
        .where(inArray(instructors.personId, staffIds))
    : [];
  const qualifications = staffIds.length
    ? await tx
        .select()
        .from(instructorQualifications)
        .where(inArray(instructorQualifications.instructorId, staffIds))
    : [];
  const [program] = await tx
    .select({ organizationId: seasons.organizationId })
    .from(programs)
    .innerJoin(seasons, eq(seasons.id, programs.seasonId))
    .where(eq(programs.id, programId));
  const otherLessons = (
    await tx
      .select({
        lesson: lessonInstances,
        revision: groupRevisions,
        slot: timeSlots,
        sourceId: seasonGroups.sourceDraftGroupId,
      })
      .from(lessonInstances)
      .innerJoin(
        groupRevisions,
        eq(groupRevisions.id, lessonInstances.groupRevisionId),
      )
      .innerJoin(
        seasonGroups,
        eq(seasonGroups.id, groupRevisions.seasonGroupId),
      )
      .innerJoin(timeSlots, eq(timeSlots.id, lessonInstances.timeSlotId))
      .where(
        and(
          eq(seasonGroups.organizationId, program!.organizationId),
          eq(lessonInstances.status, "scheduled"),
          gte(lessonInstances.lessonDate, effectiveFrom),
          lte(lessonInstances.lessonDate, effectiveUntil),
        ),
      )
  ).filter((item) => !item.sourceId || !ownedGroupIds.includes(item.sourceId));
  const otherMembers = otherLessons.length
    ? await tx
        .select()
        .from(groupRevisionMemberships)
        .where(
          inArray(groupRevisionMemberships.groupRevisionId, [
            ...new Set(otherLessons.map((item) => item.revision.id)),
          ]),
        )
    : [];
  const fail = (message: string): never => {
    throw new ApplicationError("VALIDATION", message);
  };
  const configuration = {
    disciplines: await tx
      .select()
      .from(disciplines)
      .where(eq(disciplines.programId, programId)),
    levels: await tx
      .select()
      .from(abilityLevels)
      .where(eq(abilityLevels.programId, programId)),
    bands: await tx
      .select()
      .from(ageBands)
      .where(eq(ageBands.programId, programId)),
  };
  for (const group of groups) {
    if (group.closed) {
      if (group.registrationIds.length || group.instructorIds.length)
        fail("Closed groups cannot contain students or instructors.");
      continue;
    }
    if (
      !configuration.disciplines.some(
        (item) => item.id === group.disciplineId && item.active,
      ) ||
      (group.abilityLevelId &&
        !configuration.levels.some(
          (item) => item.id === group.abilityLevelId && item.active,
        )) ||
      (group.ageBandId &&
        !configuration.bands.some(
          (item) => item.id === group.ageBandId && item.active,
        ))
    )
      fail(
        "Group characteristics must use active configuration from this program.",
      );
    const slot = slots.find(
      (item) => item.id === group.timeSlotId && item.active,
    );
    if (!slot || !slot.allowedWeekdays.includes(group.weekday))
      fail("Group uses an unavailable session.");
    if (published && group.registrationIds.length && !group.leadInstructorId)
      fail("Published lesson groups require a lead instructor.");
    if (
      group.leadInstructorId &&
      !group.instructorIds.includes(group.leadInstructorId)
    )
      fail("Lead instructor must be assigned.");
    const lessonDates = new Set(
      sessionLessons(
        slot!,
        { startsOn: effectiveFrom, endsOn: effectiveUntil },
        group.weekday,
        group.timeSlotId,
      ).map((item) => item.lessonDate),
    );
    for (const other of otherLessons.filter(
      (item) =>
        lessonDates.has(item.lesson.lessonDate) &&
        rangesOverlap(slot!, item.slot),
    )) {
      const otherStaff = new Set([
        other.revision.leadInstructorId,
        ...other.revision.instructorIds,
      ]);
      if (group.instructorIds.some((id) => otherStaff.has(id)))
        fail("An instructor is already committed to another published lesson.");
      const otherStudents = new Set(
        otherMembers
          .filter((member) => member.groupRevisionId === other.revision.id)
          .map((member) => member.studentId),
      );
      if (
        group.registrationIds.some((id) =>
          otherStudents.has(
            enrollment.find((item) => item.registration.id === id)?.person.id ??
              "",
          ),
        )
      )
        fail("A student is already committed to another published lesson.");
    }
    for (const id of group.registrationIds) {
      const row = enrollment.find((item) => item.registration.id === id);
      if (
        !row ||
        row.registration.status !== "active" ||
        row.registration.archivedAt ||
        row.person.archivedAt ||
        row.registration.disciplineId !== group.disciplineId
      )
        fail(
          "Student registration is inactive or incompatible with this group.",
        );
      const schedule = resolveRegistrationSchedule(
        row!.registration.sourceSnapshot,
        slots,
      );
      if (row!.registration.sourceSnapshot?.sourceKey && !schedule)
        fail("Resolve the student's imported session first.");
      if (
        schedule &&
        (schedule.weekday !== group.weekday ||
          schedule.timeSlotId !== group.timeSlotId)
      )
        fail(
          "Student must remain within their confirmed registration session.",
        );
      for (const other of groups.filter(
        (item) => item.id !== group.id && item.weekday === group.weekday,
      )) {
        const otherSlot = slots.find((item) => item.id === other.timeSlotId);
        if (
          otherSlot &&
          sessionsOverlap(
            { ...slot!, startsOn: effectiveFrom, endsOn: effectiveUntil },
            { ...otherSlot, startsOn: effectiveFrom, endsOn: effectiveUntil },
            group.weekday,
          ) &&
          other.registrationIds.some(
            (otherId) =>
              enrollment.find((item) => item.registration.id === otherId)
                ?.person.id === row!.person.id,
          )
        )
          fail("A student would have overlapping placements.");
      }
    }
    for (const id of group.instructorIds) {
      const profile = staff.find((item) => item.instructor.personId === id);
      if (
        !profile ||
        profile.archivedAt ||
        !qualifications.some(
          (item) =>
            item.instructorId === id &&
            item.disciplineId === group.disciplineId,
        ) ||
        !instructorAvailability(profile.instructor.preferences, {
          ...slot!,
          programId,
          weekday: group.weekday,
        }).eligible
      )
        fail(
          "Instructor qualifications or availability do not cover this group.",
        );
      if (
        groups.some(
          (other) =>
            other.id !== group.id &&
            other.weekday === group.weekday &&
            other.instructorIds.includes(id) &&
            sessionsOverlap(
              slot!,
              slots.find((item) => item.id === other.timeSlotId)!,
              group.weekday,
            ),
        )
      )
        fail("Instructor would have overlapping assignments.");
    }
  }
}

export const lifecycleQuerySchema = z.object({
  draftId: z.uuid(),
  asOf: z.iso.date().optional(),
  studentId: z.uuid().optional(),
});
export async function getGroupLifecycle(
  actor: Actor,
  input: z.infer<typeof lifecycleQuerySchema>,
) {
  requirePermission(actor, "grouping:edit");
  const ctx = await context(db, actor, input.draftId);
  const changes = await db
    .select()
    .from(groupChangeRequests)
    .where(eq(groupChangeRequests.draftId, input.draftId))
    .orderBy(
      asc(groupChangeRequests.resultingVersion),
      asc(groupChangeRequests.createdAt),
    );
  const applied = changes.filter((change) => change.status === "applied");
  const asOf = input.asOf ?? localToday(ctx.timezone);
  const base = ctx.draft.finalizedSnapshot ?? [];
  const groups = await describeGroups(
    db,
    ctx.draft.programId,
    groupsAsOf(base, applied, asOf),
  );
  const studentRegistrations = input.studentId
    ? await db
        .select({ id: registrations.id })
        .from(registrations)
        .where(
          and(
            eq(registrations.studentId, input.studentId),
            eq(registrations.programId, ctx.draft.programId),
          ),
        )
    : [];
  const ids = new Set(studentRegistrations.map((row) => row.id));
  const actorIds = [
    ...new Set(
      changes.flatMap((change) => [
        change.actorId,
        ...(change.approvedBy ? [change.approvedBy] : []),
      ]),
    ),
  ];
  const actors = actorIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];
  return {
    actors,
    asOf,
    version: ctx.draft.version,
    finalized: Boolean(ctx.draft.finalizedSnapshot),
    canApprove: actor.role === "admin",
    groups,
    changes: input.studentId
      ? changes.filter((change) =>
          change.action.type === "move"
            ? ids.has(change.action.registrationId)
            : [...(change.before ?? []), ...(change.after ?? [])].some(
                (group) => group.registrationIds.some((id) => ids.has(id)),
              ),
        )
      : changes,
  };
}

export const proposeGroupChangeSchema = z
  .object({
    draftId: z.uuid(),
    commandId: z.uuid(),
    baseVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000),
    effectiveFrom: z.iso.date(),
    effectiveUntil: z.iso.date().nullable(),
    action: groupChangeActionSchema,
  })
  .refine(
    (value) =>
      !value.effectiveUntil || value.effectiveUntil >= value.effectiveFrom,
    "Invalid effective date range.",
  );
export const decideGroupChangeSchema = z.object({
  changeId: z.uuid(),
  approve: z.boolean(),
});

async function applyRequest(
  tx: Tx,
  actor: Actor,
  request: typeof groupChangeRequests.$inferSelect,
  validateOnly = false,
) {
  const ctx = await context(tx, actor, request.draftId);
  if (
    !ctx.draft.finalizedSnapshot ||
    !["approved", "published"].includes(ctx.draft.status)
  )
    throw new ApplicationError(
      "INVALID_STATE",
      "Finalize placements before using this change workflow.",
    );
  if (ctx.draft.version !== request.baseVersion)
    throw new ApplicationError(
      "VERSION_CONFLICT",
      "Placements changed since this proposal. Review and submit a new proposal.",
    );
  if (
    request.effectiveFrom < ctx.season.startsOn ||
    request.effectiveFrom < localToday(ctx.timezone) ||
    request.effectiveFrom > ctx.season.endsOn ||
    (request.effectiveUntil && request.effectiveUntil > ctx.season.endsOn)
  )
    throw new ApplicationError(
      "VALIDATION",
      "Changes must affect today or future dates within the season.",
    );
  const previous = await tx
    .select()
    .from(groupChangeRequests)
    .where(
      and(
        eq(groupChangeRequests.draftId, request.draftId),
        eq(groupChangeRequests.status, "applied"),
      ),
    )
    .orderBy(asc(groupChangeRequests.resultingVersion));
  const changes = [...previous, request];
  const boundaries = lifecycleBoundaries(
    changes,
    ctx.season.startsOn,
    ctx.season.endsOn,
  );
  for (let i = 0; i < boundaries.length; i++) {
    const date = boundaries[i]!;
    if (
      (boundaries[i + 1] ?? nextDate(ctx.season.endsOn)) <=
      request.effectiveFrom
    )
      continue;
    await validateLifecycleSnapshot(
      tx,
      ctx.draft.programId,
      groupsAsOf(ctx.draft.finalizedSnapshot, changes, date),
      ctx.draft.status === "published",
      date,
      boundaries[i + 1] ? nextDate(boundaries[i + 1]!, -1) : ctx.season.endsOn,
      [
        ...ctx.draft.finalizedSnapshot.map((group) => group.id),
        ...changes.flatMap((change) =>
          change.action.type === "split" ? [change.action.newGroupId] : [],
        ),
      ],
    );
  }
  const before = await describeGroups(
    tx,
    ctx.draft.programId,
    groupsAsOf(ctx.draft.finalizedSnapshot, previous, request.effectiveFrom),
  );
  const after = await describeGroups(
    tx,
    ctx.draft.programId,
    groupsAsOf(ctx.draft.finalizedSnapshot, changes, request.effectiveFrom),
  );
  if (validateOnly) return;
  const version = ctx.draft.version + 1;
  await tx
    .update(groupChangeRequests)
    .set({
      status: "applied",
      approvedBy: actor.userId,
      resultingVersion: version,
      before,
      after,
      updatedAt: new Date(),
    })
    .where(eq(groupChangeRequests.id, request.id));
  await tx
    .update(groupingDrafts)
    .set({ version, updatedAt: new Date() })
    .where(eq(groupingDrafts.id, request.draftId));
  if (ctx.draft.status === "published")
    await compileLifecycleLessons(
      tx,
      actor,
      request.draftId,
      request.effectiveFrom,
      [
        ...new Set(
          [...before, ...after]
            .filter(
              (group) =>
                JSON.stringify(before.find((item) => item.id === group.id)) !==
                JSON.stringify(after.find((item) => item.id === group.id)),
            )
            .map((group) => group.id),
        ),
      ],
    );
  await tx.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    entityType: "grouping_draft",
    entityId: request.draftId,
    action: "grouping.change_applied",
    metadata: {
      changeId: request.id,
      type: request.action.type,
      effectiveFrom: request.effectiveFrom,
      effectiveUntil: request.effectiveUntil,
      version,
    },
  });
}

export async function proposeGroupChange(
  actor: Actor,
  input: z.infer<typeof proposeGroupChangeSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = proposeGroupChangeSchema.parse(input);
  return db.transaction(
    async (tx) => {
      await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, actor.organizationId))
        .for("update");
      const ctx = await context(tx, actor, parsed.draftId);
      if (!ctx.draft.finalizedSnapshot)
        throw new ApplicationError(
          "INVALID_STATE",
          "Placements are not finalized.",
        );
      const [existing] = await tx
        .select()
        .from(groupChangeRequests)
        .where(
          and(
            eq(groupChangeRequests.commandId, parsed.commandId),
            eq(groupChangeRequests.organizationId, actor.organizationId),
          ),
        );
      if (existing) return { id: existing.id, status: existing.status };
      const [request] = await tx
        .insert(groupChangeRequests)
        .values({
          ...parsed,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        })
        .returning();
      await applyRequest(tx, actor, request!, actor.role !== "admin");
      if (actor.role !== "admin")
        await tx.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          entityType: "grouping_draft",
          entityId: parsed.draftId,
          action: "grouping.change_proposed",
          metadata: { changeId: request!.id, type: parsed.action.type },
        });
      return {
        id: request!.id,
        status: actor.role === "admin" ? "applied" : "pending",
      };
    },
    { isolationLevel: "serializable" },
  );
}
export async function decideGroupChange(
  actor: Actor,
  input: z.infer<typeof decideGroupChangeSchema>,
) {
  requirePermission(actor, "grouping:approve");
  return db.transaction(
    async (tx) => {
      await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, actor.organizationId))
        .for("update");
      const [request] = await tx
        .select()
        .from(groupChangeRequests)
        .where(
          and(
            eq(groupChangeRequests.id, input.changeId),
            eq(groupChangeRequests.organizationId, actor.organizationId),
          ),
        )
        .for("update");
      if (!request)
        throw new ApplicationError("NOT_FOUND", "Proposal not found.");
      if (request.status !== "pending") return { status: request.status };
      if (input.approve) await applyRequest(tx, actor, request);
      else {
        await tx
          .update(groupChangeRequests)
          .set({
            status: "rejected",
            approvedBy: actor.userId,
            updatedAt: new Date(),
          })
          .where(eq(groupChangeRequests.id, request.id));
        await tx.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          entityType: "grouping_draft",
          entityId: request.draftId,
          action: "grouping.change_rejected",
          metadata: { changeId: request.id },
        });
      }
      return { status: input.approve ? "applied" : "rejected" };
    },
    { isolationLevel: "serializable" },
  );
}

/** Recompile only untouched future lessons. Old instances remain cancelled and
 * retain their IDs; completed attendance and notes are never rewritten. */
export async function compileLifecycleLessons(
  tx: Tx,
  actor: Actor,
  draftId: string,
  from?: string,
  affectedGroupIds?: Array<string>,
) {
  const ctx = await context(tx, actor, draftId);
  if (!ctx.draft.finalizedSnapshot)
    throw new ApplicationError("INVALID_STATE", "Finalized snapshot missing.");
  const start = from ?? ctx.season.startsOn;
  const changes = await tx
    .select()
    .from(groupChangeRequests)
    .where(
      and(
        eq(groupChangeRequests.draftId, draftId),
        eq(groupChangeRequests.status, "applied"),
      ),
    )
    .orderBy(asc(groupChangeRequests.resultingVersion));
  const allIds = [
    ...new Set([
      ...ctx.draft.finalizedSnapshot.map((group) => group.id),
      ...changes.flatMap((change) =>
        change.action.type === "split" ? [change.action.newGroupId] : [],
      ),
    ]),
  ];
  const existingGroups = allIds.length
    ? await tx
        .select()
        .from(seasonGroups)
        .where(
          and(
            eq(seasonGroups.organizationId, actor.organizationId),
            inArray(
              seasonGroups.sourceDraftGroupId,
              affectedGroupIds ?? allIds,
            ),
          ),
        )
    : [];
  if (existingGroups.length) {
    const future = await tx
      .select({ lesson: lessonInstances })
      .from(lessonInstances)
      .innerJoin(
        groupRevisions,
        eq(groupRevisions.id, lessonInstances.groupRevisionId),
      )
      .where(
        and(
          inArray(
            groupRevisions.seasonGroupId,
            existingGroups.map((group) => group.id),
          ),
          gte(lessonInstances.lessonDate, start),
        ),
      );
    const active = future.filter((item) => item.lesson.status !== "cancelled");
    const attendance = active.length
      ? await tx
          .select()
          .from(lessonAttendance)
          .where(
            inArray(
              lessonAttendance.lessonInstanceId,
              active.map((item) => item.lesson.id),
            ),
          )
      : [];
    if (
      attendance.length ||
      active.some(
        (item) => item.lesson.status !== "scheduled" || item.lesson.notes,
      )
    )
      throw new ApplicationError(
        "VALIDATION",
        "An affected lesson already has attendance, notes, or a completed status. Choose a later effective date.",
      );
    if (active.length)
      await tx
        .update(lessonInstances)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          inArray(
            lessonInstances.id,
            active.map((item) => item.lesson.id),
          ),
        );
  }
  const slots = await tx
    .select()
    .from(timeSlots)
    .where(eq(timeSlots.programId, ctx.draft.programId));
  const enrollment = await tx
    .select()
    .from(registrations)
    .where(eq(registrations.programId, ctx.draft.programId));
  const [number] = await tx
    .select({ value: max(seasonGroups.groupNumber) })
    .from(seasonGroups)
    .where(eq(seasonGroups.programId, ctx.draft.programId));
  let nextNumber = (number?.value ?? 0) + 1;
  const mapping = new Map(
    existingGroups.map((group) => [group.sourceDraftGroupId!, group.id]),
  );
  const boundaries = lifecycleBoundaries(changes, start, ctx.season.endsOn);
  let lessonCount = 0;
  for (let index = 0; index < boundaries.length; index++) {
    const effectiveFrom = boundaries[index]!,
      effectiveUntil = boundaries[index + 1]
        ? nextDate(boundaries[index + 1]!, -1)
        : ctx.season.endsOn;
    const groups = await describeGroups(
      tx,
      ctx.draft.programId,
      groupsAsOf(ctx.draft.finalizedSnapshot, changes, effectiveFrom),
    );
    await validateLifecycleSnapshot(
      tx,
      ctx.draft.programId,
      groups,
      true,
      effectiveFrom,
      effectiveUntil,
      allIds,
    );
    for (const group of groups.filter(
      (item) =>
        item.registrationIds.length &&
        (!affectedGroupIds || affectedGroupIds.includes(item.id)),
    )) {
      const slot = slots.find((item) => item.id === group.timeSlotId)!;
      if (slot.cohort !== "season" && (!slot.startsOn || !slot.endsOn))
        throw new ApplicationError(
          "VALIDATION",
          "Set cohort dates before publishing lessons.",
        );
      if (!mapping.has(group.id)) {
        const [created] = await tx
          .insert(seasonGroups)
          .values({
            organizationId: actor.organizationId,
            seasonId: ctx.season.id,
            programId: ctx.draft.programId,
            sourceDraftGroupId: group.id,
            parentGroupId: group.parentGroupId
              ? mapping.get(group.parentGroupId)
              : null,
            groupNumber: nextNumber++,
          })
          .returning();
        mapping.set(group.id, created!.id);
      }
      const lessons = sessionLessons(
        slot,
        { startsOn: effectiveFrom, endsOn: effectiveUntil },
        group.weekday,
        group.timeSlotId,
      );
      if (!lessons.length) continue;
      const [revision] = await tx
        .insert(groupRevisions)
        .values({
          seasonGroupId: mapping.get(group.id)!,
          disciplineId: group.disciplineId,
          ageBandId: group.ageBandId,
          abilityLevelId: group.abilityLevelId,
          leadInstructorId: group.leadInstructorId,
          instructorIds: group.instructorIds,
          description: group.description,
          notes: group.notes,
          effectiveFrom,
          effectiveUntil,
        })
        .returning();
      await tx.insert(groupRecurrences).values({
        groupRevisionId: revision!.id,
        weekday: group.weekday,
        timeSlotId: group.timeSlotId,
      });
      await tx.insert(groupRevisionMemberships).values(
        group.registrationIds.map((id) => ({
          groupRevisionId: revision!.id,
          registrationId: id,
          studentId: enrollment.find((item) => item.id === id)!.studentId,
          effectiveFrom,
          effectiveUntil,
        })),
      );
      await tx.insert(lessonInstances).values(
        lessons.map((lesson) => ({
          groupRevisionId: revision!.id,
          lessonDate: lesson.lessonDate,
          timeSlotId: lesson.timeSlotId,
        })),
      );
      lessonCount += lessons.length;
    }
  }
  const finalLayout = groupsAsOf(
    ctx.draft.finalizedSnapshot,
    changes,
    ctx.season.endsOn,
  );
  for (const [sourceId, id] of mapping)
    await tx
      .update(seasonGroups)
      .set({
        status: finalLayout.find((group) => group.id === sourceId)?.closed
          ? "closed"
          : "published",
        updatedAt: new Date(),
      })
      .where(eq(seasonGroups.id, id));
  return { seasonGroupIds: [...mapping.values()], lessonCount };
}
