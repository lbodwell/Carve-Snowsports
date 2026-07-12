import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import { auditEvents, seasons } from "@/db/schema";

const createSeasonSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine((input) => input.endsOn >= input.startsOn, {
    path: ["endsOn"],
    message: "Season end date must be on or after the start date.",
  });

export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;

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
      action: "created",
      metadata: { name: season.name },
    });

    return season;
  });
}

export async function listSeasons(actor: Actor) {
  requirePermission(actor, "program:manage");
  return db
    .select()
    .from(seasons)
    .where(
      and(
        eq(seasons.organizationId, actor.organizationId),
        eq(seasons.status, "draft"),
      ),
    );
}
