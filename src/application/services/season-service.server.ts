import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import {
  abilityLevels,
  auditEvents,
  disciplines,
  programs,
  seasons,
  timeSlots,
} from "@/db/schema";

const seasonStatusSchema = z.enum(["draft", "active", "closed"]);

const seasonDateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine((input) => input.endsOn >= input.startsOn, {
    path: ["endsOn"],
    message: "Season end date must be on or after the start date.",
  });

export const createSeasonSchema = seasonDateSchema;
export const updateSeasonSchema = seasonDateSchema.extend({
  seasonId: z.uuid(),
  status: seasonStatusSchema,
});

export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type UpdateSeasonInput = z.infer<typeof updateSeasonSchema>;

async function assertSeasonInOrganization(actor: Actor, seasonId: string) {
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        eq(seasons.id, seasonId),
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );
  if (!season) {
    throw new ApplicationError("NOT_FOUND", "Season not found.");
  }
}

export async function createSeason(actor: Actor, input: CreateSeasonInput) {
  requirePermission(actor, "program:manage");
  const parsed = createSeasonSchema.parse(input);

  return db.transaction(async (tx) => {
    const [season] = await tx
      .insert(seasons)
      .values({
        organizationId: actor.organizationId,
        name: parsed.name,
        startsOn: parsed.startsOn,
        endsOn: parsed.endsOn,
      })
      .returning();

    if (!season) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The season could not be created.",
      );
    }

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "season",
      entityId: season.id,
      action: "season.created",
      metadata: { name: season.name },
    });

    return season;
  });
}

export async function updateSeason(actor: Actor, input: UpdateSeasonInput) {
  requirePermission(actor, "program:manage");
  const parsed = updateSeasonSchema.parse(input);
  await assertSeasonInOrganization(actor, parsed.seasonId);

  return db.transaction(async (tx) => {
    const [season] = await tx
      .update(seasons)
      .set({
        name: parsed.name,
        startsOn: parsed.startsOn,
        endsOn: parsed.endsOn,
        status: parsed.status,
        updatedAt: new Date(),
      })
      .where(eq(seasons.id, parsed.seasonId))
      .returning();

    if (!season) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The season could not be updated.",
      );
    }

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "season",
      entityId: season.id,
      action: "season.updated",
      metadata: { name: season.name, status: season.status },
    });

    return season;
  });
}

export async function getSeasonProgramConfiguration(actor: Actor) {
  requirePermission(actor, "program:manage");

  const seasonRows = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      startsOn: seasons.startsOn,
      endsOn: seasons.endsOn,
      status: seasons.status,
    })
    .from(seasons)
    .where(
      and(
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    )
    .orderBy(desc(seasons.startsOn));

  if (seasonRows.length === 0) {
    return { seasons: [] as Array<never> };
  }

  const programRows = await db
    .select({
      id: programs.id,
      seasonId: programs.seasonId,
      name: programs.name,
      description: programs.description,
      status: programs.status,
      disciplineCount: sql<number>`(
        select count(*)::int from ${disciplines}
        where ${disciplines.programId} = ${programs.id}
      )`,
      abilityLevelCount: sql<number>`(
        select count(*)::int from ${abilityLevels}
        where ${abilityLevels.programId} = ${programs.id}
      )`,
      timeSlotCount: sql<number>`(
        select count(*)::int from ${timeSlots}
        where ${timeSlots.programId} = ${programs.id}
      )`,
    })
    .from(programs)
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    )
    .orderBy(asc(seasons.startsOn), asc(programs.name));

  const programsBySeason = new Map<
    string,
    Array<(typeof programRows)[number]>
  >();
  for (const program of programRows) {
    const existing = programsBySeason.get(program.seasonId) ?? [];
    existing.push(program);
    programsBySeason.set(program.seasonId, existing);
  }

  return {
    seasons: seasonRows.map((season) => ({
      ...season,
      programs: programsBySeason.get(season.id) ?? [],
    })),
  };
}
