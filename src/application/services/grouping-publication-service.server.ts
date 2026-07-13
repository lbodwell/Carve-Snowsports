import { and, asc, eq, inArray, max } from "drizzle-orm";

import type { Actor } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import { generateLessonCalendar } from "@/domain/calendar/lesson-calendar";
import { rangesOverlap } from "@/domain/calendar/time-ranges";
import {
  auditEvents,
  groupRecurrences,
  groupRevisionMemberships,
  groupRevisions,
  groupingDraftAssignments,
  groupingDraftGroups,
  groupingDraftInstructors,
  groupingDrafts,
  lessonInstances,
  programs,
  registrations,
  seasonGroups,
  seasons,
  timeSlots,
} from "@/db/schema";

type DraftGroupRow = {
  id: string;
  disciplineId: string | null;
  abilityLevelId: string | null;
  ageBandId: string | null;
  leadInstructorId: string | null;
  weekday: number;
  timeSlotId: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
};

async function loadApprovedDraft(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor: Actor,
  draftId: string,
) {
  const [draft] = await tx
    .select({
      id: groupingDrafts.id,
      programId: groupingDrafts.programId,
      status: groupingDrafts.status,
      version: groupingDrafts.version,
      publishedAt: groupingDrafts.publishedAt,
      seasonId: seasons.id,
      organizationId: seasons.organizationId,
      startsOn: seasons.startsOn,
      endsOn: seasons.endsOn,
    })
    .from(groupingDrafts)
    .innerJoin(programs, eq(groupingDrafts.programId, programs.id))
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(groupingDrafts.id, draftId),
        eq(seasons.organizationId, actor.organizationId),
      ),
    );
  if (!draft) {
    throw new ApplicationError("NOT_FOUND", "Grouping draft not found.");
  }
  return draft;
}

async function loadDraftGroups(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  draftId: string,
) {
  return tx
    .select({
      id: groupingDraftGroups.id,
      disciplineId: groupingDraftGroups.disciplineId,
      abilityLevelId: groupingDraftGroups.abilityLevelId,
      ageBandId: groupingDraftGroups.ageBandId,
      leadInstructorId: groupingDraftGroups.leadInstructorId,
      weekday: groupingDraftGroups.weekday,
      timeSlotId: groupingDraftGroups.timeSlotId,
      notes: groupingDraftGroups.notes,
      startsAt: timeSlots.startsAt,
      endsAt: timeSlots.endsAt,
    })
    .from(groupingDraftGroups)
    .innerJoin(timeSlots, eq(groupingDraftGroups.timeSlotId, timeSlots.id))
    .where(eq(groupingDraftGroups.draftId, draftId))
    .orderBy(asc(groupingDraftGroups.createdAt));
}

function validateDraftForPublication(groups: Array<DraftGroupRow>) {
  if (groups.length === 0) {
    throw new ApplicationError(
      "VALIDATION",
      "Add at least one group before publishing.",
    );
  }
  const missingLead = groups.filter((group) => !group.leadInstructorId);
  if (missingLead.length > 0) {
    throw new ApplicationError(
      "VALIDATION",
      "Every group needs a lead instructor before publication.",
    );
  }
}

async function validateNoScheduleConflicts(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  draftId: string,
  groups: Array<DraftGroupRow>,
) {
  const groupIds = groups.map((group) => group.id);
  const [assignments, instructors] = await Promise.all([
    tx
      .select({
        registrationId: groupingDraftAssignments.registrationId,
        groupId: groupingDraftGroups.id,
        weekday: groupingDraftGroups.weekday,
        startsAt: timeSlots.startsAt,
        endsAt: timeSlots.endsAt,
      })
      .from(groupingDraftAssignments)
      .innerJoin(
        groupingDraftGroups,
        eq(groupingDraftAssignments.draftGroupId, groupingDraftGroups.id),
      )
      .innerJoin(timeSlots, eq(groupingDraftGroups.timeSlotId, timeSlots.id))
      .where(eq(groupingDraftAssignments.draftId, draftId)),
    groupIds.length
      ? tx
          .select({
            instructorId: groupingDraftInstructors.instructorId,
            groupId: groupingDraftGroups.id,
            weekday: groupingDraftGroups.weekday,
            startsAt: timeSlots.startsAt,
            endsAt: timeSlots.endsAt,
          })
          .from(groupingDraftInstructors)
          .innerJoin(
            groupingDraftGroups,
            eq(groupingDraftInstructors.draftGroupId, groupingDraftGroups.id),
          )
          .innerJoin(timeSlots, eq(groupingDraftGroups.timeSlotId, timeSlots.id))
          .where(inArray(groupingDraftInstructors.draftGroupId, groupIds))
      : [],
  ]);

  for (const assignment of assignments) {
    const conflicts = assignments.filter(
      (candidate) =>
        candidate.registrationId === assignment.registrationId &&
        candidate.groupId !== assignment.groupId &&
        candidate.weekday === assignment.weekday &&
        rangesOverlap(candidate, assignment),
    );
    if (conflicts.length > 0) {
      throw new ApplicationError(
        "VALIDATION",
        "A student is assigned to overlapping lesson times.",
      );
    }
  }

  for (const assignment of instructors) {
    const conflicts = instructors.filter(
      (candidate) =>
        candidate.instructorId === assignment.instructorId &&
        candidate.groupId !== assignment.groupId &&
        candidate.weekday === assignment.weekday &&
        rangesOverlap(candidate, assignment),
    );
    if (conflicts.length > 0) {
      throw new ApplicationError(
        "VALIDATION",
        "An instructor is assigned to overlapping lesson times.",
      );
    }
  }
}

export async function publishGroupingDraft(
  actor: Actor,
  input: { draftId: string; idempotencyKey: string },
) {
  requirePermission(actor, "grouping:approve");

  return db.transaction(async (tx) => {
    const draft = await loadApprovedDraft(tx, actor, input.draftId);

    if (draft.status === "published") {
      const [existingPublication] = await tx
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entityType, "grouping_draft"),
            eq(auditEvents.entityId, draft.id),
            eq(auditEvents.action, "grouping.draft_published"),
          ),
        )
        .orderBy(asc(auditEvents.createdAt));
      if (
        existingPublication?.metadata.idempotencyKey === input.idempotencyKey
      ) {
        return {
          draftId: draft.id,
          publishedAt: draft.publishedAt,
          seasonGroupIds:
            (existingPublication.metadata.seasonGroupIds as
              | Array<string>
              | undefined) ?? [],
        };
      }
      throw new ApplicationError(
        "INVALID_STATE",
        "This draft has already been published.",
      );
    }

    if (draft.status !== "approved") {
      throw new ApplicationError(
        "INVALID_STATE",
        "Only approved drafts can be published.",
      );
    }

    const groups = await loadDraftGroups(tx, draft.id);
    validateDraftForPublication(groups);
    await validateNoScheduleConflicts(tx, draft.id, groups);

    const [numberRow] = await tx
      .select({ maxNumber: max(seasonGroups.groupNumber) })
      .from(seasonGroups)
      .where(
        and(
          eq(seasonGroups.organizationId, draft.organizationId),
          eq(seasonGroups.seasonId, draft.seasonId),
          eq(seasonGroups.programId, draft.programId),
        ),
      );
    let nextGroupNumber = (numberRow?.maxNumber ?? 0) + 1;
    const seasonGroupIds: Array<string> = [];
    const lessonInstanceCountByGroup: Array<number> = [];

    for (const group of groups) {
      const [seasonGroup] = await tx
        .insert(seasonGroups)
        .values({
          organizationId: draft.organizationId,
          seasonId: draft.seasonId,
          programId: draft.programId,
          groupNumber: nextGroupNumber,
          status: "published",
        })
        .returning({ id: seasonGroups.id });
      if (!seasonGroup) {
        throw new ApplicationError(
          "INVALID_STATE",
          "Season group could not be created.",
        );
      }
      nextGroupNumber += 1;
      seasonGroupIds.push(seasonGroup.id);

      const [revision] = await tx
        .insert(groupRevisions)
        .values({
          seasonGroupId: seasonGroup.id,
          disciplineId: group.disciplineId,
          abilityLevelId: group.abilityLevelId,
          ageBandId: group.ageBandId,
          leadInstructorId: group.leadInstructorId,
          notes: group.notes,
          effectiveFrom: draft.startsOn,
          effectiveUntil: null,
        })
        .returning({ id: groupRevisions.id });
      if (!revision) {
        throw new ApplicationError(
          "INVALID_STATE",
          "Group revision could not be created.",
        );
      }

      await tx.insert(groupRecurrences).values({
        groupRevisionId: revision.id,
        weekday: group.weekday,
        timeSlotId: group.timeSlotId,
      });

      const assignments = await tx
        .select({
          registrationId: groupingDraftAssignments.registrationId,
          studentId: registrations.studentId,
        })
        .from(groupingDraftAssignments)
        .innerJoin(
          registrations,
          eq(groupingDraftAssignments.registrationId, registrations.id),
        )
        .where(eq(groupingDraftAssignments.draftGroupId, group.id));
      if (assignments.length > 0) {
        await tx.insert(groupRevisionMemberships).values(
          assignments.map((assignment) => ({
            groupRevisionId: revision.id,
            studentId: assignment.studentId,
            registrationId: assignment.registrationId,
            effectiveFrom: draft.startsOn,
            effectiveUntil: null,
          })),
        );
      }

      const lessons = generateLessonCalendar({
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
        recurrences: [{ weekday: group.weekday, timeSlotId: group.timeSlotId }],
        excludedDates: new Set<string>(),
      });
      lessonInstanceCountByGroup.push(lessons.length);

      if (lessons.length > 0) {
        await tx.insert(lessonInstances).values(
          lessons.map((lesson) => ({
            groupRevisionId: revision.id,
            lessonDate: lesson.lessonDate,
            timeSlotId: lesson.timeSlotId,
            status: "scheduled",
          })),
        );
      }
    }

    const publishedAt = new Date();
    const [updated] = await tx
      .update(groupingDrafts)
      .set({
        status: "published",
        publishedAt,
        updatedAt: publishedAt,
      })
      .where(
        and(
          eq(groupingDrafts.id, draft.id),
          eq(groupingDrafts.status, "approved"),
        ),
      )
      .returning({ id: groupingDrafts.id });
    if (!updated) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The draft changed before publication could finish.",
      );
    }

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "grouping_draft",
      entityId: draft.id,
      action: "grouping.draft_published",
      metadata: {
        idempotencyKey: input.idempotencyKey,
        seasonGroupIds,
        groupCount: groups.length,
        lessonInstanceCount: lessonInstanceCountByGroup.reduce(
          (sum, count) => sum + count,
          0,
        ),
      },
    });

    return { draftId: draft.id, publishedAt, seasonGroupIds };
  });
}
