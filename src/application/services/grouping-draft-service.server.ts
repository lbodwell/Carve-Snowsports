import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import type { GroupingProgramSnapshot } from "@/application/services/grouping-snapshot.server";
import { ApplicationError } from "@/application/errors";
import {
  hasPermission,
  requirePermission,
} from "@/application/policies/authorization";
import { projectGroupingRosterStudent } from "@/application/policies/sensitive-field-projection";
import {
  DEFAULT_DRAFT_WEEKDAY,
  GROUPING_RULE_SET_VERSION,
  buildEngineInput,
  resolveAgeBandForBirthDate,
} from "@/application/services/grouping-snapshot.server";
import { publishGroupingDraft as publishGroupingDraftInService } from "@/application/services/grouping-publication-service.server";
import { db } from "@/db/client.server";
import { rangesOverlap } from "@/domain/calendar/time-ranges";
import { generateGroupingDraft } from "@/domain/grouping/engine";
import {
  abilityLevels,
  ageBands,
  auditEvents,
  disciplines,
  draftOperations,
  groupingDraftAssignments,
  groupingDraftGroups,
  groupingDraftInstructors,
  groupingDrafts,
  instructorQualifications,
  instructors,
  people,
  programs,
  registrations,
  seasons,
  students,
  timeSlots,
} from "@/db/schema";

export const createGroupingDraftSchema = z.object({ programId: z.uuid() });
export const createDraftGroupSchema = z.object({
  draftId: z.uuid(),
  baseVersion: z.number().int().positive(),
  commandId: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  timeSlotId: z.uuid(),
  disciplineId: z.uuid(),
  abilityLevelId: z.uuid().nullable(),
  ageBandId: z.uuid().nullable(),
});
export const moveRegistrationSchema = z.object({
  draftId: z.uuid(),
  baseVersion: z.number().int().positive(),
  commandId: z.uuid(),
  registrationId: z.uuid(),
  groupId: z.uuid().nullable(),
  fromGroupId: z.uuid().nullable().optional(),
  overrideReason: z.string().trim().max(1000).optional(),
});
export const assignDraftInstructorSchema = z
  .object({
    draftId: z.uuid(),
    baseVersion: z.number().int().positive(),
    commandId: z.uuid(),
    groupId: z.uuid(),
    instructorIds: z.array(z.uuid()).max(10),
    leadInstructorId: z.uuid().nullable(),
  })
  .refine(
    (value) =>
      value.leadInstructorId === null ||
      value.instructorIds.includes(value.leadInstructorId),
    {
      message: "The lead instructor must be assigned to the group.",
      path: ["leadInstructorId"],
    },
  );
export const updateDraftGroupSchema = z.object({
  draftId: z.uuid(),
  baseVersion: z.number().int().positive(),
  commandId: z.uuid(),
  groupId: z.uuid(),
  weekday: z.number().int().min(0).max(6),
  timeSlotId: z.uuid(),
  disciplineId: z.uuid(),
  abilityLevelId: z.uuid().nullable(),
  ageBandId: z.uuid().nullable(),
  notes: z.string().trim().max(5000),
});
export const deleteDraftGroupSchema = z.object({
  draftId: z.uuid(),
  baseVersion: z.number().int().positive(),
  commandId: z.uuid(),
  groupId: z.uuid(),
});
export const undoDraftOperationSchema = z.object({
  draftId: z.uuid(),
  baseVersion: z.number().int().positive(),
  commandId: z.uuid(),
});
export const submitGroupingDraftSchema = z.object({
  draftId: z.uuid(),
  baseVersion: z.number().int().positive(),
});
export const approveGroupingDraftSchema = z.object({
  draftId: z.uuid(),
  baseVersion: z.number().int().positive(),
});
export const publishGroupingDraftSchema = z.object({
  draftId: z.uuid(),
  idempotencyKey: z.uuid(),
});

async function getProgram(actor: Actor, programId?: string) {
  const [program] = await db
    .select({
      id: programs.id,
      name: programs.name,
      seasonId: seasons.id,
      seasonName: seasons.name,
    })
    .from(programs)
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
        ...(programId ? [eq(programs.id, programId)] : []),
      ),
    )
    .orderBy(asc(seasons.startsOn), asc(programs.name));
  if (!program) {
    throw new ApplicationError(
      "NOT_FOUND",
      "No active program is available for grouping.",
    );
  }
  return program;
}

export async function getGroupingWorkspace(actor: Actor) {
  requirePermission(actor, "grouping:edit");
  const program = await getProgram(actor);
  const [draft] = await db
    .select()
    .from(groupingDrafts)
    .where(
      and(
        eq(groupingDrafts.programId, program.id),
        inArray(groupingDrafts.status, ["editing", "submitted", "approved"]),
      ),
    )
    .orderBy(asc(groupingDrafts.createdAt));

  const [configuration, roster, instructorRows] = await Promise.all([
    Promise.all([
      db
        .select()
        .from(disciplines)
        .where(eq(disciplines.programId, program.id))
        .orderBy(asc(disciplines.displayOrder)),
      db
        .select()
        .from(abilityLevels)
        .where(eq(abilityLevels.programId, program.id))
        .orderBy(asc(abilityLevels.displayOrder)),
      db
        .select()
        .from(ageBands)
        .where(eq(ageBands.programId, program.id))
        .orderBy(asc(ageBands.displayOrder)),
      db
        .select()
        .from(timeSlots)
        .where(eq(timeSlots.programId, program.id))
        .orderBy(asc(timeSlots.displayOrder)),
    ]),
    db
      .select({
        registrationId: registrations.id,
        studentId: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        dateOfBirth: people.dateOfBirth,
        disciplineId: registrations.disciplineId,
        abilityLevelId: registrations.abilityLevelId,
      })
      .from(registrations)
      .innerJoin(students, eq(registrations.studentId, students.personId))
      .innerJoin(people, eq(students.personId, people.id))
      .where(
        and(
          eq(registrations.programId, program.id),
          eq(registrations.status, "active"),
          isNull(registrations.archivedAt),
          isNull(people.archivedAt),
        ),
      )
      .orderBy(asc(people.lastName), asc(people.firstName)),
    db
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
      })
      .from(instructors)
      .innerJoin(people, eq(instructors.personId, people.id))
      .where(
        and(
          eq(people.organizationId, actor.organizationId),
          isNull(people.archivedAt),
        ),
      )
      .orderBy(asc(people.lastName), asc(people.firstName)),
  ]);

  const [disciplineRows, levelRows, ageBandRows, timeSlotRows] = configuration;
  const projectedRoster = roster.map((student) =>
    projectGroupingRosterStudent(actor, student),
  );
  if (!draft) {
    return {
      program,
      draft: null,
      groups: [],
      assignments: [],
      roster: projectedRoster,
      instructors: instructorRows.map((row) => ({
        ...row,
        disciplineIds: [] as Array<string>,
      })),
      disciplines: disciplineRows,
      abilityLevels: levelRows,
      ageBands: ageBandRows,
      timeSlots: timeSlotRows,
      capabilities: {
        canEdit: hasPermission(actor, "grouping:edit"),
        canApprove: hasPermission(actor, "grouping:approve"),
        canUndo: false,
      },
      unplacedReasons: {} as Record<string, string>,
    };
  }

  const groups = await db
    .select()
    .from(groupingDraftGroups)
    .where(eq(groupingDraftGroups.draftId, draft.id))
    .orderBy(asc(groupingDraftGroups.createdAt));
  const groupIds = groups.map((group) => group.id);
  const [assignments, assignedInstructors, qualifications, lastOperation, creationEvent] =
    await Promise.all([
      groupIds.length
        ? db
            .select()
            .from(groupingDraftAssignments)
            .where(inArray(groupingDraftAssignments.draftGroupId, groupIds))
        : [],
      groupIds.length
        ? db
            .select()
            .from(groupingDraftInstructors)
            .where(inArray(groupingDraftInstructors.draftGroupId, groupIds))
        : [],
      instructorRows.length
        ? db
            .select({
              instructorId: instructorQualifications.instructorId,
              disciplineId: instructorQualifications.disciplineId,
            })
            .from(instructorQualifications)
            .where(
              inArray(
                instructorQualifications.instructorId,
                instructorRows.map((row) => row.id),
              ),
            )
        : [],
      draft.status === "editing"
        ? db
            .select({
              id: draftOperations.id,
              operationType: draftOperations.operationType,
            })
            .from(draftOperations)
            .where(eq(draftOperations.draftId, draft.id))
            .orderBy(desc(draftOperations.resultingVersion))
            .limit(1)
        : Promise.resolve([]),
      db
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entityType, "grouping_draft"),
            eq(auditEvents.entityId, draft.id),
            eq(auditEvents.action, "grouping.draft_created"),
          ),
        )
        .orderBy(asc(auditEvents.createdAt))
        .limit(1),
    ]);

  const unplacedReasons =
    (creationEvent[0]?.metadata.unplacedReasons as
      | Record<string, string>
      | undefined) ?? {};

  return {
    program,
    draft,
    groups: groups.map((group) => ({
      ...group,
      instructorIds: assignedInstructors
        .filter((row) => row.draftGroupId === group.id)
        .map((row) => row.instructorId),
    })),
    assignments,
    roster: projectedRoster,
    instructors: instructorRows.map((row) => ({
      ...row,
      disciplineIds: qualifications
        .filter((item) => item.instructorId === row.id)
        .map((item) => item.disciplineId),
    })),
    disciplines: disciplineRows,
    abilityLevels: levelRows,
    ageBands: ageBandRows,
    timeSlots: timeSlotRows,
    capabilities: {
      canEdit:
        hasPermission(actor, "grouping:edit") && draft.status === "editing",
      canApprove: hasPermission(actor, "grouping:approve"),
      canUndo:
        draft.status === "editing" &&
        hasPermission(actor, "grouping:edit") &&
        lastOperation[0]?.operationType === "move_registration",
    },
    unplacedReasons,
  };
}

async function loadProgramSnapshot(
  actor: Actor,
  programId: string,
): Promise<GroupingProgramSnapshot> {
  const [program] = await db
    .select({
      id: programs.id,
      seasonStartsOn: seasons.startsOn,
    })
    .from(programs)
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(programs.id, programId),
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );
  if (!program) {
    throw new ApplicationError(
      "NOT_FOUND",
      "No active program is available for grouping.",
    );
  }

  const [disciplineRows, levelRows, ageBandRows, timeSlotRows, roster, staff] =
    await Promise.all([
      db
        .select({ id: disciplines.id, key: disciplines.key })
        .from(disciplines)
        .where(eq(disciplines.programId, programId))
        .orderBy(asc(disciplines.displayOrder)),
      db
        .select({ id: abilityLevels.id, numericRank: abilityLevels.numericRank })
        .from(abilityLevels)
        .where(eq(abilityLevels.programId, programId))
        .orderBy(asc(abilityLevels.displayOrder)),
      db
        .select({
          id: ageBands.id,
          minimumAge: ageBands.minimumAge,
          maximumAge: ageBands.maximumAge,
        })
        .from(ageBands)
        .where(eq(ageBands.programId, programId))
        .orderBy(asc(ageBands.displayOrder)),
      db
        .select({ id: timeSlots.id })
        .from(timeSlots)
        .where(eq(timeSlots.programId, programId))
        .orderBy(asc(timeSlots.displayOrder)),
      db
        .select({
          id: registrations.id,
          disciplineId: registrations.disciplineId,
          abilityLevelId: registrations.abilityLevelId,
          dateOfBirth: people.dateOfBirth,
        })
        .from(registrations)
        .innerJoin(students, eq(registrations.studentId, students.personId))
        .innerJoin(people, eq(students.personId, people.id))
        .where(
          and(
            eq(registrations.programId, programId),
            eq(registrations.status, "active"),
            isNull(registrations.archivedAt),
            isNull(people.archivedAt),
          ),
        ),
      db
        .select({ id: people.id })
        .from(instructors)
        .innerJoin(people, eq(instructors.personId, people.id))
        .where(
          and(
            eq(people.organizationId, actor.organizationId),
            isNull(people.archivedAt),
          ),
        ),
    ]);

  const disciplineById = new Map(
    disciplineRows.map((row) => [row.id, row.key] as const),
  );
  const abilityRankById = new Map(
    levelRows.map((row) => [row.id, row.numericRank] as const),
  );
  const instructorIds = staff.map((row) => row.id);
  const qualifications =
    instructorIds.length > 0
      ? await db
          .select({
            instructorId: instructorQualifications.instructorId,
            disciplineKey: disciplines.key,
          })
          .from(instructorQualifications)
          .innerJoin(
            disciplines,
            eq(instructorQualifications.disciplineId, disciplines.id),
          )
          .where(
            inArray(instructorQualifications.instructorId, instructorIds),
          )
      : [];

  const defaultTimeSlotId = timeSlotRows[0]?.id;
  if (!defaultTimeSlotId) {
    throw new ApplicationError(
      "VALIDATION",
      "Configure at least one time slot before generating a draft.",
    );
  }

  return {
    seasonStartsOn: program.seasonStartsOn,
    defaultTimeSlotId,
    disciplines: disciplineRows,
    ageBands: ageBandRows,
    abilityLevels: levelRows,
    registrations: roster.map((registration) => {
      const ageBand = resolveAgeBandForBirthDate(
        registration.dateOfBirth,
        program.seasonStartsOn,
        ageBandRows,
      );
      return {
        id: registration.id,
        disciplineId: registration.disciplineId,
        disciplineKey: registration.disciplineId
          ? (disciplineById.get(registration.disciplineId) ?? null)
          : null,
        abilityLevelId: registration.abilityLevelId,
        abilityRank: registration.abilityLevelId
          ? (abilityRankById.get(registration.abilityLevelId) ?? 1)
          : 1,
        dateOfBirth: registration.dateOfBirth,
        ageBandId: ageBand?.id ?? null,
        ageBandEngineKey: ageBand?.engineKey ?? null,
      };
    }),
    instructors: instructorIds.map((id) => ({
      id,
      disciplineKeys: new Set(
        qualifications
          .filter((item) => item.instructorId === id)
          .map((item) => item.disciplineKey),
      ),
    })),
  };
}

async function persistGeneratedDraft(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  draftId: string,
  snapshot: GroupingProgramSnapshot,
) {
  const engineInput = buildEngineInput(snapshot);
  const result = generateGroupingDraft(
    engineInput.registrations,
    engineInput.instructors,
    engineInput.rules,
  );

  const disciplineByKey = new Map(
    snapshot.disciplines.map((row) => [row.key, row.id] as const),
  );
  const ageBandByKey = new Map<string, string>(
    snapshot.ageBands.map((row) => [
      `${row.minimumAge}-${row.maximumAge}`,
      row.id,
    ]),
  );
  const registrationById = new Map(
    snapshot.registrations.map((row) => [row.id, row] as const),
  );
  const unplacedReasons = Object.fromEntries(
    result.unplaced.map((item) => [item.registrationId, item.reason]),
  );

  for (const proposed of result.groups) {
    const disciplineId = disciplineByKey.get(proposed.discipline) ?? null;
    const ageBandId = ageBandByKey.get(proposed.ageBand) ?? null;
    const abilityLevelId =
      proposed.registrationIds
        .map((id) => registrationById.get(id)?.abilityLevelId)
        .find((value) => value !== null && value !== undefined) ?? null;
    const notes = proposed.explanations.join(" ");

    const [group] = await tx
      .insert(groupingDraftGroups)
      .values({
        draftId,
        weekday: DEFAULT_DRAFT_WEEKDAY,
        timeSlotId: snapshot.defaultTimeSlotId,
        disciplineId,
        ageBandId,
        abilityLevelId,
        leadInstructorId: proposed.instructorId,
        notes,
      })
      .returning({ id: groupingDraftGroups.id });
    if (!group) continue;

    if (proposed.registrationIds.length > 0) {
      await tx.insert(groupingDraftAssignments).values(
        proposed.registrationIds.map((registrationId) => ({
          draftId,
          draftGroupId: group.id,
          registrationId,
        })),
      );
    }

    if (proposed.instructorId) {
      await tx.insert(groupingDraftInstructors).values({
        draftGroupId: group.id,
        instructorId: proposed.instructorId,
      });
    }
  }

  return {
    engineVersion: result.engineVersion,
    groupCount: result.groups.length,
    unplacedCount: result.unplaced.length,
    unplacedReasons,
  };
}

export async function createGroupingDraft(
  actor: Actor,
  input: z.infer<typeof createGroupingDraftSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = createGroupingDraftSchema.parse(input);
  const snapshot = await loadProgramSnapshot(actor, parsed.programId);

  const [existing] = await db
    .select({ id: groupingDrafts.id })
    .from(groupingDrafts)
    .where(
      and(
        eq(groupingDrafts.programId, parsed.programId),
        eq(groupingDrafts.status, "editing"),
      ),
    );
  if (existing) return existing;

  return db.transaction(async (tx) => {
    const [draft] = await tx
      .insert(groupingDrafts)
      .values({
        programId: parsed.programId,
        ruleSetVersion: GROUPING_RULE_SET_VERSION,
        createdBy: actor.userId,
      })
      .returning({ id: groupingDrafts.id });
    if (!draft) {
      throw new ApplicationError("INVALID_STATE", "Draft could not be created.");
    }

    const generation = await persistGeneratedDraft(tx, draft.id, snapshot);

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "grouping_draft",
      entityId: draft.id,
      action: "grouping.draft_created",
      metadata: {
        programId: parsed.programId,
        ruleSetVersion: GROUPING_RULE_SET_VERSION,
        engineVersion: generation.engineVersion,
        groupCount: generation.groupCount,
        unplacedCount: generation.unplacedCount,
        unplacedReasons: generation.unplacedReasons,
      },
    });

    return draft;
  });
}

async function incrementDraftVersion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor: Actor,
  draftId: string,
  baseVersion: number,
) {
  const [authorizedDraft] = await tx
    .select({ id: groupingDrafts.id })
    .from(groupingDrafts)
    .innerJoin(programs, eq(groupingDrafts.programId, programs.id))
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(groupingDrafts.id, draftId),
        eq(seasons.organizationId, actor.organizationId),
      ),
    );
  if (!authorizedDraft) {
    throw new ApplicationError("NOT_FOUND", "Grouping draft not found.");
  }
  const [updated] = await tx
    .update(groupingDrafts)
    .set({ version: baseVersion + 1, updatedAt: new Date() })
    .where(
      and(
        eq(groupingDrafts.id, draftId),
        eq(groupingDrafts.version, baseVersion),
        eq(groupingDrafts.status, "editing"),
      ),
    )
    .returning({ version: groupingDrafts.version });
  if (!updated) {
    const [current] = await tx
      .select({ version: groupingDrafts.version })
      .from(groupingDrafts)
      .where(eq(groupingDrafts.id, draftId));
    throw new ApplicationError(
      "VERSION_CONFLICT",
      "This draft changed in another session. Refresh before retrying.",
      undefined,
      current?.version,
    );
  }
  return updated.version;
}

export async function createDraftGroup(
  actor: Actor,
  input: z.infer<typeof createDraftGroupSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = createDraftGroupSchema.parse(input);
  return db.transaction(async (tx) => {
    const version = await incrementDraftVersion(
      tx,
      actor,
      parsed.draftId,
      parsed.baseVersion,
    );
    const [configuration] = await tx
      .select({ draftId: groupingDrafts.id })
      .from(groupingDrafts)
      .innerJoin(
        disciplines,
        and(
          eq(disciplines.programId, groupingDrafts.programId),
          eq(disciplines.id, parsed.disciplineId),
        ),
      )
      .innerJoin(
        timeSlots,
        and(
          eq(timeSlots.programId, groupingDrafts.programId),
          eq(timeSlots.id, parsed.timeSlotId),
        ),
      )
      .where(eq(groupingDrafts.id, parsed.draftId));
    if (!configuration) {
      throw new ApplicationError(
        "VALIDATION",
        "The selected group configuration is not part of this program.",
      );
    }
    const [group] = await tx
      .insert(groupingDraftGroups)
      .values({
        draftId: parsed.draftId,
        weekday: parsed.weekday,
        timeSlotId: parsed.timeSlotId,
        disciplineId: parsed.disciplineId,
        abilityLevelId: parsed.abilityLevelId,
        ageBandId: parsed.ageBandId,
      })
      .returning({ id: groupingDraftGroups.id });
    if (!group)
      throw new ApplicationError(
        "INVALID_STATE",
        "Group could not be created.",
      );
    await tx.insert(draftOperations).values({
      commandId: parsed.commandId,
      draftId: parsed.draftId,
      actorId: actor.userId,
      baseVersion: parsed.baseVersion,
      resultingVersion: version,
      operationType: "create_group",
      payload: { groupId: group.id },
    });
    return { groupId: group.id, version };
  });
}

export async function moveRegistration(
  actor: Actor,
  input: z.infer<typeof moveRegistrationSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = moveRegistrationSchema.parse(input);
  return db.transaction(async (tx) => {
    const [replayed] = await tx
      .select({ resultingVersion: draftOperations.resultingVersion })
      .from(draftOperations)
      .where(eq(draftOperations.commandId, parsed.commandId));
    if (replayed) return { version: replayed.resultingVersion };
    const version = await incrementDraftVersion(
      tx,
      actor,
      parsed.draftId,
      parsed.baseVersion,
    );
    const [registration] = await tx
      .select({
        id: registrations.id,
        disciplineId: registrations.disciplineId,
        dateOfBirth: people.dateOfBirth,
        seasonStartsOn: seasons.startsOn,
      })
      .from(registrations)
      .innerJoin(
        groupingDrafts,
        eq(registrations.programId, groupingDrafts.programId),
      )
      .innerJoin(programs, eq(groupingDrafts.programId, programs.id))
      .innerJoin(seasons, eq(programs.seasonId, seasons.id))
      .innerJoin(students, eq(registrations.studentId, students.personId))
      .innerJoin(people, eq(students.personId, people.id))
      .where(
        and(
          eq(groupingDrafts.id, parsed.draftId),
          eq(registrations.id, parsed.registrationId),
        ),
      );
    let targetGroup:
      | {
          id: string;
          disciplineId: string | null;
          ageBandId: string | null;
          weekday: number;
          startsAt: string;
          endsAt: string;
        }
      | undefined;
    if (parsed.groupId) {
      const matches = await tx
        .select({
          id: groupingDraftGroups.id,
          disciplineId: groupingDraftGroups.disciplineId,
          ageBandId: groupingDraftGroups.ageBandId,
          weekday: groupingDraftGroups.weekday,
          startsAt: timeSlots.startsAt,
          endsAt: timeSlots.endsAt,
        })
        .from(groupingDraftGroups)
        .innerJoin(timeSlots, eq(groupingDraftGroups.timeSlotId, timeSlots.id))
        .where(
          and(
            eq(groupingDraftGroups.id, parsed.groupId),
            eq(groupingDraftGroups.draftId, parsed.draftId),
          ),
        );
      targetGroup = matches[0];
    }
    if (!registration || (parsed.groupId && !targetGroup)) {
      throw new ApplicationError(
        "VALIDATION",
        "The student or group is not part of this draft.",
      );
    }
    if (targetGroup) {
      if (
        registration.disciplineId &&
        targetGroup.disciplineId !== registration.disciplineId &&
        !parsed.overrideReason
      ) {
        throw new ApplicationError(
          "VALIDATION",
          "This student’s registered discipline does not match the group. Provide an override reason to continue.",
        );
      }
      if (targetGroup.ageBandId && registration.dateOfBirth) {
        const [band] = await tx
          .select({
            minimumAge: ageBands.minimumAge,
            maximumAge: ageBands.maximumAge,
          })
          .from(ageBands)
          .where(eq(ageBands.id, targetGroup.ageBandId));
        if (band) {
          const birth = new Date(`${registration.dateOfBirth}T00:00:00Z`);
          const seasonStart = new Date(
            `${registration.seasonStartsOn}T00:00:00Z`,
          );
          let age = seasonStart.getUTCFullYear() - birth.getUTCFullYear();
          if (
            seasonStart.getUTCMonth() < birth.getUTCMonth() ||
            (seasonStart.getUTCMonth() === birth.getUTCMonth() &&
              seasonStart.getUTCDate() < birth.getUTCDate())
          ) {
            age -= 1;
          }
          if (
            (age < band.minimumAge || age > band.maximumAge) &&
            !parsed.overrideReason
          ) {
            throw new ApplicationError(
              "VALIDATION",
              "This student is outside the group’s age band. Provide an override reason to continue.",
            );
          }
        }
      }
      const overlappingCandidates = await tx
        .select({
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
        .where(
          and(
            eq(groupingDraftAssignments.draftId, parsed.draftId),
            eq(groupingDraftAssignments.registrationId, parsed.registrationId),
          ),
        );
      if (
        overlappingCandidates.some(
          (candidate) =>
            candidate.groupId !== targetGroup.id &&
            candidate.groupId !== parsed.fromGroupId &&
            candidate.weekday === targetGroup.weekday &&
            rangesOverlap(candidate, targetGroup),
        )
      ) {
        throw new ApplicationError(
          "VALIDATION",
          "This student is already assigned to an overlapping lesson time.",
        );
      }
    }
    if (parsed.fromGroupId) {
      await tx
        .delete(groupingDraftAssignments)
        .where(
          and(
            eq(groupingDraftAssignments.draftGroupId, parsed.fromGroupId),
            eq(groupingDraftAssignments.registrationId, parsed.registrationId),
          ),
        );
    }
    if (parsed.groupId) {
      await tx.insert(groupingDraftAssignments).values({
        draftId: parsed.draftId,
        draftGroupId: parsed.groupId,
        registrationId: parsed.registrationId,
        overrideReason: parsed.overrideReason,
      });
    }
    await tx.insert(draftOperations).values({
      commandId: parsed.commandId,
      draftId: parsed.draftId,
      actorId: actor.userId,
      baseVersion: parsed.baseVersion,
      resultingVersion: version,
      operationType: "move_registration",
      payload: {
        registrationId: parsed.registrationId,
        groupId: parsed.groupId,
        fromGroupId: parsed.fromGroupId,
        overrideReason: parsed.overrideReason,
      },
    });
    return { version };
  });
}

export async function assignDraftInstructor(
  actor: Actor,
  input: z.infer<typeof assignDraftInstructorSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = assignDraftInstructorSchema.parse(input);
  return db.transaction(async (tx) => {
    const version = await incrementDraftVersion(
      tx,
      actor,
      parsed.draftId,
      parsed.baseVersion,
    );
    const [group] = await tx
      .select({
        id: groupingDraftGroups.id,
        disciplineId: groupingDraftGroups.disciplineId,
        weekday: groupingDraftGroups.weekday,
        startsAt: timeSlots.startsAt,
        endsAt: timeSlots.endsAt,
      })
      .from(groupingDraftGroups)
      .innerJoin(timeSlots, eq(groupingDraftGroups.timeSlotId, timeSlots.id))
      .where(
        and(
          eq(groupingDraftGroups.id, parsed.groupId),
          eq(groupingDraftGroups.draftId, parsed.draftId),
        ),
      );
    let instructorsExist = true;
    if (parsed.instructorIds.length > 0) {
      const matches = await tx
        .select({ id: people.id })
        .from(instructors)
        .innerJoin(people, eq(instructors.personId, people.id))
        .where(
          and(
            inArray(people.id, parsed.instructorIds),
            eq(people.organizationId, actor.organizationId),
            isNull(people.archivedAt),
          ),
        );
      instructorsExist = matches.length === parsed.instructorIds.length;
    }
    if (!group || !instructorsExist) {
      throw new ApplicationError(
        "VALIDATION",
        "The group or instructor is not available in this workspace.",
      );
    }
    if (parsed.instructorIds.length > 0 && group.disciplineId) {
      const qualifications = await tx
        .select({
          instructorId: instructorQualifications.instructorId,
        })
        .from(instructorQualifications)
        .where(
          and(
            inArray(
              instructorQualifications.instructorId,
              parsed.instructorIds,
            ),
            eq(instructorQualifications.disciplineId, group.disciplineId),
          ),
        );
      if (qualifications.length !== parsed.instructorIds.length) {
        throw new ApplicationError(
          "VALIDATION",
          "Every assigned instructor must be qualified for the group discipline.",
        );
      }
      const existingAssignments = await tx
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
        .where(
          and(
            eq(groupingDraftGroups.draftId, parsed.draftId),
            inArray(
              groupingDraftInstructors.instructorId,
              parsed.instructorIds,
            ),
          ),
        );
      if (
        existingAssignments.some(
          (assignment) =>
            assignment.groupId !== group.id &&
            assignment.weekday === group.weekday &&
            rangesOverlap(assignment, group),
        )
      ) {
        throw new ApplicationError(
          "VALIDATION",
          "An instructor is already assigned to an overlapping lesson time.",
        );
      }
    }
    await tx
      .delete(groupingDraftInstructors)
      .where(eq(groupingDraftInstructors.draftGroupId, parsed.groupId));
    if (parsed.instructorIds.length > 0) {
      await tx.insert(groupingDraftInstructors).values(
        parsed.instructorIds.map((instructorId) => ({
          draftGroupId: parsed.groupId,
          instructorId,
        })),
      );
    }
    await tx
      .update(groupingDraftGroups)
      .set({
        leadInstructorId: parsed.leadInstructorId,
        updatedAt: new Date(),
      })
      .where(eq(groupingDraftGroups.id, parsed.groupId));
    await tx.insert(draftOperations).values({
      commandId: parsed.commandId,
      draftId: parsed.draftId,
      actorId: actor.userId,
      baseVersion: parsed.baseVersion,
      resultingVersion: version,
      operationType: "assign_instructor",
      payload: {
        groupId: parsed.groupId,
        instructorIds: parsed.instructorIds,
        leadInstructorId: parsed.leadInstructorId,
      },
    });
    return { version };
  });
}

export async function updateDraftGroup(
  actor: Actor,
  input: z.infer<typeof updateDraftGroupSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = updateDraftGroupSchema.parse(input);
  return db.transaction(async (tx) => {
    const version = await incrementDraftVersion(
      tx,
      actor,
      parsed.draftId,
      parsed.baseVersion,
    );
    const [configuration] = await tx
      .select({
        startsAt: timeSlots.startsAt,
        endsAt: timeSlots.endsAt,
      })
      .from(groupingDrafts)
      .innerJoin(
        disciplines,
        and(
          eq(disciplines.programId, groupingDrafts.programId),
          eq(disciplines.id, parsed.disciplineId),
        ),
      )
      .innerJoin(
        timeSlots,
        and(
          eq(timeSlots.programId, groupingDrafts.programId),
          eq(timeSlots.id, parsed.timeSlotId),
        ),
      )
      .where(eq(groupingDrafts.id, parsed.draftId));
    if (!configuration) {
      throw new ApplicationError(
        "VALIDATION",
        "The selected group configuration is not part of this program.",
      );
    }
    const assignedRegistrations = await tx
      .select({
        registrationId: registrations.id,
        disciplineId: registrations.disciplineId,
      })
      .from(groupingDraftAssignments)
      .innerJoin(
        registrations,
        eq(groupingDraftAssignments.registrationId, registrations.id),
      )
      .where(eq(groupingDraftAssignments.draftGroupId, parsed.groupId));
    if (
      assignedRegistrations.some(
        (registration) =>
          registration.disciplineId &&
          registration.disciplineId !== parsed.disciplineId,
      )
    ) {
      throw new ApplicationError(
        "VALIDATION",
        "Move students with a different registered discipline before changing this group.",
      );
    }
    const assignedStaff = await tx
      .select({ instructorId: groupingDraftInstructors.instructorId })
      .from(groupingDraftInstructors)
      .where(eq(groupingDraftInstructors.draftGroupId, parsed.groupId));
    if (assignedStaff.length > 0) {
      const qualified = await tx
        .select({ instructorId: instructorQualifications.instructorId })
        .from(instructorQualifications)
        .where(
          and(
            inArray(
              instructorQualifications.instructorId,
              assignedStaff.map((item) => item.instructorId),
            ),
            eq(instructorQualifications.disciplineId, parsed.disciplineId),
          ),
        );
      if (qualified.length !== assignedStaff.length) {
        throw new ApplicationError(
          "VALIDATION",
          "Remove instructors who are not qualified for the new discipline.",
        );
      }
    }
    const studentConflicts =
      assignedRegistrations.length === 0
        ? []
        : await tx
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
            .innerJoin(
              timeSlots,
              eq(groupingDraftGroups.timeSlotId, timeSlots.id),
            )
            .where(
              and(
                eq(groupingDraftGroups.draftId, parsed.draftId),
                inArray(
                  groupingDraftAssignments.registrationId,
                  assignedRegistrations.map((item) => item.registrationId),
                ),
              ),
            );
    const proposedRange = {
      startsAt: configuration.startsAt,
      endsAt: configuration.endsAt,
    };
    if (
      studentConflicts.some(
        (item) =>
          item.groupId !== parsed.groupId &&
          item.weekday === parsed.weekday &&
          rangesOverlap(item, proposedRange),
      )
    ) {
      throw new ApplicationError(
        "VALIDATION",
        "The new schedule overlaps another group for an assigned student.",
      );
    }
    const staffConflicts =
      assignedStaff.length === 0
        ? []
        : await tx
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
            .innerJoin(
              timeSlots,
              eq(groupingDraftGroups.timeSlotId, timeSlots.id),
            )
            .where(
              and(
                eq(groupingDraftGroups.draftId, parsed.draftId),
                inArray(
                  groupingDraftInstructors.instructorId,
                  assignedStaff.map((item) => item.instructorId),
                ),
              ),
            );
    if (
      staffConflicts.some(
        (item) =>
          item.groupId !== parsed.groupId &&
          item.weekday === parsed.weekday &&
          rangesOverlap(item, proposedRange),
      )
    ) {
      throw new ApplicationError(
        "VALIDATION",
        "The new schedule overlaps another group for an assigned instructor.",
      );
    }
    const [updated] = await tx
      .update(groupingDraftGroups)
      .set({
        weekday: parsed.weekday,
        timeSlotId: parsed.timeSlotId,
        disciplineId: parsed.disciplineId,
        abilityLevelId: parsed.abilityLevelId,
        ageBandId: parsed.ageBandId,
        notes: parsed.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupingDraftGroups.id, parsed.groupId),
          eq(groupingDraftGroups.draftId, parsed.draftId),
        ),
      )
      .returning({ id: groupingDraftGroups.id });
    if (!updated) {
      throw new ApplicationError("NOT_FOUND", "Draft group not found.");
    }
    await tx.insert(draftOperations).values({
      commandId: parsed.commandId,
      draftId: parsed.draftId,
      actorId: actor.userId,
      baseVersion: parsed.baseVersion,
      resultingVersion: version,
      operationType: "update_group",
      payload: {
        groupId: parsed.groupId,
        weekday: parsed.weekday,
        timeSlotId: parsed.timeSlotId,
        disciplineId: parsed.disciplineId,
        abilityLevelId: parsed.abilityLevelId,
        ageBandId: parsed.ageBandId,
      },
    });
    return { version };
  });
}

export async function deleteDraftGroup(
  actor: Actor,
  input: z.infer<typeof deleteDraftGroupSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = deleteDraftGroupSchema.parse(input);
  return db.transaction(async (tx) => {
    const version = await incrementDraftVersion(
      tx,
      actor,
      parsed.draftId,
      parsed.baseVersion,
    );
    const [deleted] = await tx
      .delete(groupingDraftGroups)
      .where(
        and(
          eq(groupingDraftGroups.id, parsed.groupId),
          eq(groupingDraftGroups.draftId, parsed.draftId),
        ),
      )
      .returning({ id: groupingDraftGroups.id });
    if (!deleted) {
      throw new ApplicationError("NOT_FOUND", "Draft group not found.");
    }
    await tx.insert(draftOperations).values({
      commandId: parsed.commandId,
      draftId: parsed.draftId,
      actorId: actor.userId,
      baseVersion: parsed.baseVersion,
      resultingVersion: version,
      operationType: "delete_group",
      payload: { groupId: parsed.groupId },
    });
    return { version };
  });
}

async function transitionDraftStatus(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor: Actor,
  input: {
    draftId: string;
    baseVersion: number;
    fromStatus: "editing" | "submitted" | "approved";
    toStatus: "submitted" | "approved" | "published";
    submittedAt?: Date;
    approvedAt?: Date;
  },
) {
  const [authorizedDraft] = await tx
    .select({ id: groupingDrafts.id })
    .from(groupingDrafts)
    .innerJoin(programs, eq(groupingDrafts.programId, programs.id))
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(groupingDrafts.id, input.draftId),
        eq(seasons.organizationId, actor.organizationId),
      ),
    );
  if (!authorizedDraft) {
    throw new ApplicationError("NOT_FOUND", "Grouping draft not found.");
  }

  const [updated] = await tx
    .update(groupingDrafts)
    .set({
      status: input.toStatus,
      version: input.baseVersion + 1,
      submittedAt: input.submittedAt,
      approvedAt: input.approvedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(groupingDrafts.id, input.draftId),
        eq(groupingDrafts.version, input.baseVersion),
        eq(groupingDrafts.status, input.fromStatus),
      ),
    )
    .returning({ version: groupingDrafts.version });
  if (!updated) {
    const [current] = await tx
      .select({ version: groupingDrafts.version, status: groupingDrafts.status })
      .from(groupingDrafts)
      .where(eq(groupingDrafts.id, input.draftId));
    throw new ApplicationError(
      "VERSION_CONFLICT",
      "This draft changed in another session. Refresh before retrying.",
      undefined,
      current?.version,
    );
  }
  return updated.version;
}

export async function undoDraftOperation(
  actor: Actor,
  input: z.infer<typeof undoDraftOperationSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = undoDraftOperationSchema.parse(input);

  return db.transaction(async (tx) => {
    const [replayed] = await tx
      .select({ resultingVersion: draftOperations.resultingVersion })
      .from(draftOperations)
      .where(eq(draftOperations.commandId, parsed.commandId));
    if (replayed) return { version: replayed.resultingVersion };

    const [lastOperation] = await tx
      .select({
        operationType: draftOperations.operationType,
        payload: draftOperations.payload,
      })
      .from(draftOperations)
      .where(eq(draftOperations.draftId, parsed.draftId))
      .orderBy(desc(draftOperations.resultingVersion))
      .limit(1);
    if (!lastOperation || lastOperation.operationType !== "move_registration") {
      throw new ApplicationError(
        "INVALID_STATE",
        "There is no undoable move to reverse.",
      );
    }

    const payload = lastOperation.payload as {
      registrationId: string;
      groupId: string | null;
      fromGroupId?: string | null;
      overrideReason?: string;
    };

    const version = await incrementDraftVersion(
      tx,
      actor,
      parsed.draftId,
      parsed.baseVersion,
    );

    if (payload.fromGroupId) {
      await tx
        .delete(groupingDraftAssignments)
        .where(
          and(
            eq(
              groupingDraftAssignments.registrationId,
              payload.registrationId,
            ),
            eq(groupingDraftAssignments.draftId, parsed.draftId),
          ),
        );
      await tx.insert(groupingDraftAssignments).values({
        draftId: parsed.draftId,
        draftGroupId: payload.fromGroupId,
        registrationId: payload.registrationId,
        overrideReason: payload.overrideReason,
      });
    } else {
      await tx
        .delete(groupingDraftAssignments)
        .where(
          and(
            eq(
              groupingDraftAssignments.registrationId,
              payload.registrationId,
            ),
            eq(groupingDraftAssignments.draftId, parsed.draftId),
          ),
        );
    }

    await tx.insert(draftOperations).values({
      commandId: parsed.commandId,
      draftId: parsed.draftId,
      actorId: actor.userId,
      baseVersion: parsed.baseVersion,
      resultingVersion: version,
      operationType: "undo_move_registration",
      payload: {
        registrationId: payload.registrationId,
        restoredGroupId: payload.fromGroupId ?? null,
        undoneGroupId: payload.groupId,
      },
    });

    return { version };
  });
}

export async function submitGroupingDraft(
  actor: Actor,
  input: z.infer<typeof submitGroupingDraftSchema>,
) {
  requirePermission(actor, "grouping:edit");
  const parsed = submitGroupingDraftSchema.parse(input);

  return db.transaction(async (tx) => {
    const version = await transitionDraftStatus(tx, actor, {
      draftId: parsed.draftId,
      baseVersion: parsed.baseVersion,
      fromStatus: "editing",
      toStatus: "submitted",
      submittedAt: new Date(),
    });

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "grouping_draft",
      entityId: parsed.draftId,
      action: "grouping.draft_submitted",
      metadata: { version },
    });

    return { version, status: "submitted" as const };
  });
}

export async function approveGroupingDraft(
  actor: Actor,
  input: z.infer<typeof approveGroupingDraftSchema>,
) {
  requirePermission(actor, "grouping:approve");
  const parsed = approveGroupingDraftSchema.parse(input);

  return db.transaction(async (tx) => {
    const version = await transitionDraftStatus(tx, actor, {
      draftId: parsed.draftId,
      baseVersion: parsed.baseVersion,
      fromStatus: "submitted",
      toStatus: "approved",
      approvedAt: new Date(),
    });

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "grouping_draft",
      entityId: parsed.draftId,
      action: "grouping.draft_approved",
      metadata: { version },
    });

    return { version, status: "approved" as const };
  });
}

export async function publishGroupingDraft(
  actor: Actor,
  input: z.infer<typeof publishGroupingDraftSchema>,
) {
  return publishGroupingDraftInService(actor, input);
}
