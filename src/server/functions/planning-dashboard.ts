import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { GroupingView } from "@/domain/grouping/workspace-query";
import { resolveActor } from "@/server/auth/resolve-actor.server";
import { requirePermission } from "@/application/policies/authorization";
import { getGroupingWorkspace } from "@/application/services/grouping-draft-service.server";
import { db } from "@/db/client.server";
import { groupChangeRequests, programs, seasons } from "@/db/schema";
import { weekdayNames } from "@/domain/grouping/registration-schedule";

export const getPlanningDashboard = createServerFn({ method: "GET" })
  .validator(
    z.object({ programId: z.uuid().optional(), seasonId: z.uuid().optional() }),
  )
  .handler(async ({ data }) => {
    const actor = await resolveActor();
    requirePermission(actor, "program:manage");
    const options = await db
      .select({
        id: programs.id,
        name: programs.name,
        seasonId: seasons.id,
        seasonName: seasons.name,
      })
      .from(programs)
      .innerJoin(seasons, eq(seasons.id, programs.seasonId))
      .where(
        and(
          eq(seasons.organizationId, actor.organizationId),
          isNull(seasons.archivedAt),
        ),
      );
    const selected =
      options.find(
        (item) =>
          item.id === data.programId &&
          (!data.seasonId || item.seasonId === data.seasonId),
      ) ??
      options.find((item) => !data.seasonId || item.seasonId === data.seasonId);
    if (!selected)
      return { options, selected: null, metrics: null, charts: [] };
    const workspace = await getGroupingWorkspace(actor, {
      programId: selected.id,
    });
    const active = workspace.roster.filter(
      (row) => row.registrationStatus === "active",
    );
    const placed = new Set(
      workspace.assignments.map((item) => item.registrationId),
    );
    const changes = workspace.draft
      ? await db
          .select()
          .from(groupChangeRequests)
          .where(
            and(
              eq(groupChangeRequests.draftId, workspace.draft.id),
              eq(groupChangeRequests.status, "pending"),
            ),
          )
      : [];

    const count = (items: Array<{ label: string; filters: GroupingView }>) => {
      const rows = new Map<
        string,
        { label: string; value: number; filters: GroupingView }
      >();
      for (const item of items) {
        const key = JSON.stringify(item.filters);
        const row = rows.get(key) ?? { ...item, value: 0 };
        row.value++;
        rows.set(key, row);
      }
      return [...rows.values()];
    };
    const stage =
      workspace.draft?.status === "published"
        ? "Published"
        : workspace.draft?.finalizedSnapshot
          ? "Finalized"
          : "Draft";
    return {
      options,
      selected,
      metrics: {
        students: new Set(active.map((row) => row.studentId)).size,
        registrations: active.length,
        unplaced: active.filter((row) => !placed.has(row.registrationId))
          .length,
        missingInformation: active.filter(
          (row) =>
            !row.dateOfBirth ||
            !row.abilityLevelId ||
            !row.disciplineId ||
            row.needsSchedule,
        ).length,
        surveyCovered: new Set(
          active.filter((row) => row.survey).map((row) => row.studentId),
        ).size,
        unstaffed: workspace.groups.filter(
          (group) =>
            !group.leadInstructorId &&
            workspace.assignments.some(
              (item) => item.draftGroupId === group.id,
            ),
        ).length,
        pendingChanges: changes.length,
        groups: workspace.groups.length,
        stage,
        stages: {
          draft: stage === "Draft" ? workspace.groups.length : 0,
          finalized: stage === "Finalized" ? workspace.groups.length : 0,
          published: stage === "Published" ? workspace.groups.length : 0,
        },
      },
      charts: [
        {
          title: "Registrations by day/time",
          rows: count(
            active.map((row) => ({
              label: row.schedule
                ? weekdayNames[row.schedule.weekday] +
                  " · " +
                  (workspace.timeSlots.find(
                    (slot) => slot.id === row.schedule!.timeSlotId,
                  )?.label ?? "Time needed")
                : row.needsSchedule
                  ? "Session review needed"
                  : "No registration schedule",
              filters: row.schedule
                ? {
                    weekday: row.schedule.weekday,
                    timeSlotId: row.schedule.timeSlotId,
                    view: "all",
                  }
                : {
                    allSessions: true,
                    view: row.needsSchedule ? "review" : "all",
                  },
            })),
          ),
        },
        {
          title: "Registrations by discipline and level",
          rows: count(
            active.map((row) => ({
              label:
                (workspace.disciplines.find(
                  (item) => item.id === row.disciplineId,
                )?.label ?? "Discipline needed") +
                " · " +
                (workspace.abilityLevels.find(
                  (item) => item.id === row.abilityLevelId,
                )?.label ?? "Level needed"),
              filters: {
                disciplineId: row.disciplineId ?? undefined,
                levelId: row.abilityLevelId ?? undefined,
                view: row.disciplineId && row.abilityLevelId ? "all" : "review",
              },
            })),
          ),
        },
        {
          title: "Groups by age band and level",
          rows: count(
            workspace.groups.map((group) => ({
              label:
                (workspace.ageBands.find((item) => item.id === group.ageBandId)
                  ?.label ?? "Age band needed") +
                " · " +
                (workspace.abilityLevels.find(
                  (item) => item.id === group.abilityLevelId,
                )?.label ?? "Level needed"),
              filters: {
                allSessions: true,
                ageBandId: group.ageBandId ?? undefined,
                levelId: group.abilityLevelId ?? undefined,
              },
            })),
          ),
        },
        {
          title: "Group sizes",
          rows: count(
            workspace.groups.map((group) => {
              const size = workspace.assignments.filter(
                (item) => item.draftGroupId === group.id,
              ).length;
              return {
                label: size + " students",
                filters: { allSessions: true, groupSize: size },
              };
            }),
          ),
        },
        {
          title: "Staffing coverage",
          rows: count(
            workspace.groups
              .filter((group) =>
                workspace.assignments.some(
                  (item) => item.draftGroupId === group.id,
                ),
              )
              .map((group) => ({
                label: group.leadInstructorId ? "Staffed" : "Unstaffed",
                filters: {
                  allSessions: true,
                  staffing: group.leadInstructorId ? "staffed" : "unstaffed",
                },
              })),
          ),
        },
      ],
    };
  });
