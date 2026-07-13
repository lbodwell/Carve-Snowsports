import { and, asc, eq, isNull } from "drizzle-orm";
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

const configKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only.");

const localTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, "Enter a valid time in HH:MM format.");

async function assertProgramInOrganization(actor: Actor, programId: string) {
  const [program] = await db
    .select({
      id: programs.id,
      seasonId: programs.seasonId,
      name: programs.name,
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
    throw new ApplicationError("NOT_FOUND", "Program not found.");
  }

  return program;
}

async function recordConfigurationAudit(
  actor: Actor,
  programId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  await db.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    entityType: "program",
    entityId: programId,
    action,
    metadata,
  });
}

export async function getProgramConfiguration(actor: Actor, programId: string) {
  requirePermission(actor, "program:manage");
  const program = await assertProgramInOrganization(actor, programId);

  const [season, disciplineRows, abilityLevelRows, ageBandRows, timeSlotRows] =
    await Promise.all([
      db
        .select({ id: seasons.id, name: seasons.name })
        .from(seasons)
        .where(eq(seasons.id, program.seasonId)),
      db
        .select({
          id: disciplines.id,
          key: disciplines.key,
          label: disciplines.label,
          displayOrder: disciplines.displayOrder,
          active: disciplines.active,
        })
        .from(disciplines)
        .where(eq(disciplines.programId, programId))
        .orderBy(asc(disciplines.displayOrder), asc(disciplines.label)),
      db
        .select({
          id: abilityLevels.id,
          key: abilityLevels.key,
          label: abilityLevels.label,
          numericRank: abilityLevels.numericRank,
          displayOrder: abilityLevels.displayOrder,
          active: abilityLevels.active,
        })
        .from(abilityLevels)
        .where(eq(abilityLevels.programId, programId))
        .orderBy(
          asc(abilityLevels.displayOrder),
          asc(abilityLevels.numericRank),
        ),
      db
        .select({
          id: ageBands.id,
          label: ageBands.label,
          minimumAge: ageBands.minimumAge,
          maximumAge: ageBands.maximumAge,
          displayOrder: ageBands.displayOrder,
          active: ageBands.active,
        })
        .from(ageBands)
        .where(eq(ageBands.programId, programId))
        .orderBy(asc(ageBands.displayOrder), asc(ageBands.label)),
      db
        .select({
          id: timeSlots.id,
          key: timeSlots.key,
          label: timeSlots.label,
          startsAt: timeSlots.startsAt,
          endsAt: timeSlots.endsAt,
          displayOrder: timeSlots.displayOrder,
          active: timeSlots.active,
        })
        .from(timeSlots)
        .where(eq(timeSlots.programId, programId))
        .orderBy(asc(timeSlots.displayOrder), asc(timeSlots.label)),
    ]);

  const [programDetails] = await db
    .select({
      id: programs.id,
      name: programs.name,
      description: programs.description,
      status: programs.status,
      seasonId: programs.seasonId,
    })
    .from(programs)
    .where(eq(programs.id, programId));

  return {
    program: programDetails ?? null,
    season: season[0] ?? null,
    disciplines: disciplineRows,
    abilityLevels: abilityLevelRows,
    ageBands: ageBandRows,
    timeSlots: timeSlotRows.map((slot) => ({
      ...slot,
      startsAt: slot.startsAt.slice(0, 5),
      endsAt: slot.endsAt.slice(0, 5),
    })),
  };
}

export const createDisciplineSchema = z.object({
  programId: z.uuid(),
  key: configKeySchema,
  label: z.string().trim().min(1).max(100),
  displayOrder: z.number().int().min(0).default(0),
});

export const updateDisciplineSchema = z.object({
  disciplineId: z.uuid(),
  label: z.string().trim().min(1).max(100),
  displayOrder: z.number().int().min(0),
  active: z.boolean(),
});

export async function createDiscipline(
  actor: Actor,
  input: z.infer<typeof createDisciplineSchema>,
) {
  requirePermission(actor, "program:manage");
  const parsed = createDisciplineSchema.parse(input);
  await assertProgramInOrganization(actor, parsed.programId);

  try {
    const [discipline] = await db
      .insert(disciplines)
      .values({
        programId: parsed.programId,
        key: parsed.key,
        label: parsed.label,
        displayOrder: parsed.displayOrder,
      })
      .returning();

    if (!discipline) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The discipline could not be created.",
      );
    }

    await recordConfigurationAudit(
      actor,
      parsed.programId,
      "program.discipline_created",
      {
        key: discipline.key,
        label: discipline.label,
      },
    );

    return discipline;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      "VALIDATION",
      "A discipline with this key already exists in the program.",
    );
  }
}

export async function updateDiscipline(
  actor: Actor,
  input: z.infer<typeof updateDisciplineSchema>,
) {
  requirePermission(actor, "program:manage");
  const parsed = updateDisciplineSchema.parse(input);

  const [existing] = await db
    .select({
      id: disciplines.id,
      programId: disciplines.programId,
    })
    .from(disciplines)
    .innerJoin(programs, eq(disciplines.programId, programs.id))
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(disciplines.id, parsed.disciplineId),
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );

  if (!existing) {
    throw new ApplicationError("NOT_FOUND", "Discipline not found.");
  }

  const [discipline] = await db
    .update(disciplines)
    .set({
      label: parsed.label,
      displayOrder: parsed.displayOrder,
      active: parsed.active,
      updatedAt: new Date(),
    })
    .where(eq(disciplines.id, parsed.disciplineId))
    .returning();

  if (!discipline) {
    throw new ApplicationError(
      "INVALID_STATE",
      "The discipline could not be updated.",
    );
  }

  await recordConfigurationAudit(
    actor,
    existing.programId,
    "program.discipline_updated",
    { key: discipline.key, active: discipline.active },
  );

  return discipline;
}

export const createAbilityLevelSchema = z.object({
  programId: z.uuid(),
  key: configKeySchema,
  label: z.string().trim().min(1).max(100),
  numericRank: z.number().int().min(1).max(99),
  displayOrder: z.number().int().min(0).default(0),
});

export const updateAbilityLevelSchema = z.object({
  abilityLevelId: z.uuid(),
  label: z.string().trim().min(1).max(100),
  numericRank: z.number().int().min(1).max(99),
  displayOrder: z.number().int().min(0),
  active: z.boolean(),
});

export async function createAbilityLevel(
  actor: Actor,
  input: z.infer<typeof createAbilityLevelSchema>,
) {
  requirePermission(actor, "program:manage");
  const parsed = createAbilityLevelSchema.parse(input);
  await assertProgramInOrganization(actor, parsed.programId);

  try {
    const [level] = await db
      .insert(abilityLevels)
      .values({
        programId: parsed.programId,
        key: parsed.key,
        label: parsed.label,
        numericRank: parsed.numericRank,
        displayOrder: parsed.displayOrder,
      })
      .returning();

    if (!level) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The ability level could not be created.",
      );
    }

    await recordConfigurationAudit(
      actor,
      parsed.programId,
      "program.level_created",
      {
        key: level.key,
        label: level.label,
      },
    );

    return level;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      "VALIDATION",
      "An ability level with this key or rank already exists in the program.",
    );
  }
}

export async function updateAbilityLevel(
  actor: Actor,
  input: z.infer<typeof updateAbilityLevelSchema>,
) {
  requirePermission(actor, "program:manage");
  const parsed = updateAbilityLevelSchema.parse(input);

  const [existing] = await db
    .select({
      id: abilityLevels.id,
      programId: abilityLevels.programId,
    })
    .from(abilityLevels)
    .innerJoin(programs, eq(abilityLevels.programId, programs.id))
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(abilityLevels.id, parsed.abilityLevelId),
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );

  if (!existing) {
    throw new ApplicationError("NOT_FOUND", "Ability level not found.");
  }

  try {
    const [level] = await db
      .update(abilityLevels)
      .set({
        label: parsed.label,
        numericRank: parsed.numericRank,
        displayOrder: parsed.displayOrder,
        active: parsed.active,
        updatedAt: new Date(),
      })
      .where(eq(abilityLevels.id, parsed.abilityLevelId))
      .returning();

    if (!level) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The ability level could not be updated.",
      );
    }

    await recordConfigurationAudit(
      actor,
      existing.programId,
      "program.level_updated",
      { key: level.key, active: level.active },
    );

    return level;
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      "VALIDATION",
      "Another ability level in this program already uses that rank.",
    );
  }
}

const ageBandFields = {
  label: z.string().trim().min(1).max(100),
  minimumAge: z.number().int().min(0).max(120),
  maximumAge: z.number().int().min(0).max(120),
  displayOrder: z.number().int().min(0).default(0),
};

export const createAgeBandSchema = z
  .object({
    programId: z.uuid(),
    ...ageBandFields,
  })
  .refine((input) => input.maximumAge >= input.minimumAge, {
    path: ["maximumAge"],
    message: "Maximum age must be greater than or equal to minimum age.",
  });

export const updateAgeBandSchema = z
  .object({
    ageBandId: z.uuid(),
    active: z.boolean(),
    ...ageBandFields,
  })
  .refine((input) => input.maximumAge >= input.minimumAge, {
    path: ["maximumAge"],
    message: "Maximum age must be greater than or equal to minimum age.",
  });

export async function createAgeBand(
  actor: Actor,
  input: z.infer<typeof createAgeBandSchema>,
) {
  requirePermission(actor, "program:manage");
  const parsed = createAgeBandSchema.parse(input);
  await assertProgramInOrganization(actor, parsed.programId);

  const [ageBand] = await db
    .insert(ageBands)
    .values({
      programId: parsed.programId,
      label: parsed.label,
      minimumAge: parsed.minimumAge,
      maximumAge: parsed.maximumAge,
      displayOrder: parsed.displayOrder,
    })
    .returning();

  if (!ageBand) {
    throw new ApplicationError(
      "INVALID_STATE",
      "The age band could not be created.",
    );
  }

  await recordConfigurationAudit(
    actor,
    parsed.programId,
    "program.age_band_created",
    {
      label: ageBand.label,
    },
  );

  return ageBand;
}

export async function updateAgeBand(
  actor: Actor,
  input: z.infer<typeof updateAgeBandSchema>,
) {
  requirePermission(actor, "program:manage");
  const parsed = updateAgeBandSchema.parse(input);

  const [existing] = await db
    .select({
      id: ageBands.id,
      programId: ageBands.programId,
    })
    .from(ageBands)
    .innerJoin(programs, eq(ageBands.programId, programs.id))
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(ageBands.id, parsed.ageBandId),
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );

  if (!existing) {
    throw new ApplicationError("NOT_FOUND", "Age band not found.");
  }

  const [ageBand] = await db
    .update(ageBands)
    .set({
      label: parsed.label,
      minimumAge: parsed.minimumAge,
      maximumAge: parsed.maximumAge,
      displayOrder: parsed.displayOrder,
      active: parsed.active,
      updatedAt: new Date(),
    })
    .where(eq(ageBands.id, parsed.ageBandId))
    .returning();

  if (!ageBand) {
    throw new ApplicationError(
      "INVALID_STATE",
      "The age band could not be updated.",
    );
  }

  await recordConfigurationAudit(
    actor,
    existing.programId,
    "program.age_band_updated",
    { label: ageBand.label, active: ageBand.active },
  );

  return ageBand;
}

export const createTimeSlotSchema = z
  .object({
    programId: z.uuid(),
    key: configKeySchema,
    label: z.string().trim().min(1).max(100),
    startsAt: localTimeSchema,
    endsAt: localTimeSchema,
    displayOrder: z.number().int().min(0).default(0),
  })
  .refine((input) => input.endsAt > input.startsAt, {
    path: ["endsAt"],
    message: "End time must be after start time.",
  });

export const updateTimeSlotSchema = z
  .object({
    timeSlotId: z.uuid(),
    label: z.string().trim().min(1).max(100),
    startsAt: localTimeSchema,
    endsAt: localTimeSchema,
    displayOrder: z.number().int().min(0),
    active: z.boolean(),
  })
  .refine((input) => input.endsAt > input.startsAt, {
    path: ["endsAt"],
    message: "End time must be after start time.",
  });

export async function createTimeSlot(
  actor: Actor,
  input: z.infer<typeof createTimeSlotSchema>,
) {
  requirePermission(actor, "program:manage");
  const parsed = createTimeSlotSchema.parse(input);
  await assertProgramInOrganization(actor, parsed.programId);

  try {
    const [slot] = await db
      .insert(timeSlots)
      .values({
        programId: parsed.programId,
        key: parsed.key,
        label: parsed.label,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        displayOrder: parsed.displayOrder,
      })
      .returning();

    if (!slot) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The time slot could not be created.",
      );
    }

    await recordConfigurationAudit(
      actor,
      parsed.programId,
      "program.time_slot_created",
      {
        key: slot.key,
        label: slot.label,
      },
    );

    return {
      ...slot,
      startsAt: slot.startsAt.slice(0, 5),
      endsAt: slot.endsAt.slice(0, 5),
    };
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      "VALIDATION",
      "A time slot with this key already exists in the program.",
    );
  }
}

export async function updateTimeSlot(
  actor: Actor,
  input: z.infer<typeof updateTimeSlotSchema>,
) {
  requirePermission(actor, "program:manage");
  const parsed = updateTimeSlotSchema.parse(input);

  const [existing] = await db
    .select({
      id: timeSlots.id,
      programId: timeSlots.programId,
    })
    .from(timeSlots)
    .innerJoin(programs, eq(timeSlots.programId, programs.id))
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(timeSlots.id, parsed.timeSlotId),
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
      ),
    );

  if (!existing) {
    throw new ApplicationError("NOT_FOUND", "Time slot not found.");
  }

  const [slot] = await db
    .update(timeSlots)
    .set({
      label: parsed.label,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      displayOrder: parsed.displayOrder,
      active: parsed.active,
      updatedAt: new Date(),
    })
    .where(eq(timeSlots.id, parsed.timeSlotId))
    .returning();

  if (!slot) {
    throw new ApplicationError(
      "INVALID_STATE",
      "The time slot could not be updated.",
    );
  }

  await recordConfigurationAudit(
    actor,
    existing.programId,
    "program.time_slot_updated",
    { key: slot.key, active: slot.active },
  );

  return {
    ...slot,
    startsAt: slot.startsAt.slice(0, 5),
    endsAt: slot.endsAt.slice(0, 5),
  };
}
