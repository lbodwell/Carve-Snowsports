import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createAbilityLevel,
  createAbilityLevelSchema,
  createAgeBand,
  createAgeBandSchema,
  createDiscipline,
  createDisciplineSchema,
  createTimeSlot,
  createTimeSlotSchema,
  getProgramConfiguration,
  updateAbilityLevel,
  updateAbilityLevelSchema,
  updateAgeBand,
  updateAgeBandSchema,
  updateDiscipline,
  updateDisciplineSchema,
  updateTimeSlot,
  updateTimeSlotSchema,
} from "@/application/services/program-configuration-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const getProgramConfigurationWorkspace = createServerFn({
  method: "GET",
})
  .validator(z.object({ programId: z.uuid() }))
  .handler(async ({ data }) =>
    getProgramConfiguration(await resolveActor(), data.programId),
  );

export const createDisciplineRecord = createServerFn({ method: "POST" })
  .validator(createDisciplineSchema)
  .handler(async ({ data }) => createDiscipline(await resolveActor(), data));

export const updateDisciplineRecord = createServerFn({ method: "POST" })
  .validator(updateDisciplineSchema)
  .handler(async ({ data }) => updateDiscipline(await resolveActor(), data));

export const createAbilityLevelRecord = createServerFn({ method: "POST" })
  .validator(createAbilityLevelSchema)
  .handler(async ({ data }) => createAbilityLevel(await resolveActor(), data));

export const updateAbilityLevelRecord = createServerFn({ method: "POST" })
  .validator(updateAbilityLevelSchema)
  .handler(async ({ data }) => updateAbilityLevel(await resolveActor(), data));

export const createAgeBandRecord = createServerFn({ method: "POST" })
  .validator(createAgeBandSchema)
  .handler(async ({ data }) => createAgeBand(await resolveActor(), data));

export const updateAgeBandRecord = createServerFn({ method: "POST" })
  .validator(updateAgeBandSchema)
  .handler(async ({ data }) => updateAgeBand(await resolveActor(), data));

export const createTimeSlotRecord = createServerFn({ method: "POST" })
  .validator(createTimeSlotSchema)
  .handler(async ({ data }) => createTimeSlot(await resolveActor(), data));

export const updateTimeSlotRecord = createServerFn({ method: "POST" })
  .validator(updateTimeSlotSchema)
  .handler(async ({ data }) => updateTimeSlot(await resolveActor(), data));
