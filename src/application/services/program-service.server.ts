import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import {
  abilityLevels,
  ageBands,
  auditEvents,
  disciplines,
  programs,
  seasons,
  timeSlots,
} from "@/db/schema";

const programStatusSchema = z.enum(["draft", "active", "closed"]);

export const createProgramSchema = z.object({
  seasonId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  status: programStatusSchema.default("draft"),
});

export const updateProgramSchema = z.object({
  programId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  status: programStatusSchema,
});

export type CreateProgramInput = z.infer<typeof createProgramSchema>;
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;

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

async function assertProgramInOrganization(actor: Actor, programId: string) {
  const [program] = await db
    .select({ id: programs.id, seasonId: programs.seasonId })
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
    throw new ApplicationError("NOT_FOUND", "Program not found.");
  }
  return program;
}

async function seedDefaultProgramConfiguration(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  programId: string,
) {
  await tx.insert(disciplines).values([
    { programId, key: "ski", label: "Ski", displayOrder: 1 },
    { programId, key: "snowboard", label: "Snowboard", displayOrder: 2 },
  ]);
  await tx.insert(abilityLevels).values(
    [1, 2, 3, 4, 5, 6].map((numericRank) => ({
      programId,
      key: `level-${numericRank}`,
      label: `Level ${numericRank}`,
      numericRank,
      displayOrder: numericRank,
    })),
  );
  await tx.insert(ageBands).values([
    {
      programId,
      label: "Ages 4–6",
      minimumAge: 4,
      maximumAge: 6,
      displayOrder: 1,
    },
    {
      programId,
      label: "Ages 7–12",
      minimumAge: 7,
      maximumAge: 12,
      displayOrder: 2,
    },
  ]);
  await tx.insert(timeSlots).values([
    {
      programId,
      key: "am",
      label: "Morning",
      startsAt: "09:00",
      endsAt: "12:00",
      displayOrder: 1,
    },
    {
      programId,
      key: "pm",
      label: "Afternoon",
      startsAt: "13:00",
      endsAt: "16:00",
      displayOrder: 2,
    },
  ]);
}

export async function createProgram(actor: Actor, input: CreateProgramInput) {
  requirePermission(actor, "program:manage");
  const parsed = createProgramSchema.parse(input);
  await assertSeasonInOrganization(actor, parsed.seasonId);

  return db.transaction(async (tx) => {
    const [program] = await tx
      .insert(programs)
      .values({
        seasonId: parsed.seasonId,
        name: parsed.name,
        description: parsed.description || null,
        status: parsed.status,
      })
      .returning();

    if (!program) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The program could not be created.",
      );
    }

    await seedDefaultProgramConfiguration(tx, program.id);

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "program",
      entityId: program.id,
      action: "program.created",
      metadata: { name: program.name, seasonId: parsed.seasonId },
    });

    return program;
  });
}

export async function updateProgram(actor: Actor, input: UpdateProgramInput) {
  requirePermission(actor, "program:manage");
  const parsed = updateProgramSchema.parse(input);
  await assertProgramInOrganization(actor, parsed.programId);

  return db.transaction(async (tx) => {
    const [program] = await tx
      .update(programs)
      .set({
        name: parsed.name,
        description: parsed.description || null,
        status: parsed.status,
        updatedAt: new Date(),
      })
      .where(eq(programs.id, parsed.programId))
      .returning();

    if (!program) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The program could not be updated.",
      );
    }

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "program",
      entityId: program.id,
      action: "program.updated",
      metadata: { name: program.name, status: program.status },
    });

    return program;
  });
}

export async function listProgramsForSeason(actor: Actor, seasonId: string) {
  requirePermission(actor, "program:manage");
  await assertSeasonInOrganization(actor, seasonId);

  return db
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
    .where(eq(programs.seasonId, seasonId))
    .orderBy(asc(programs.name));
}
