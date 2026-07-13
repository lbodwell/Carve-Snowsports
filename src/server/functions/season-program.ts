import { createServerFn } from "@tanstack/react-start";

import {
  createProgram,
  createProgramSchema,
  updateProgram,
  updateProgramSchema,
} from "@/application/services/program-service.server";
import {
  createSeason,
  createSeasonSchema,
  getSeasonProgramConfiguration,
  updateSeason,
  updateSeasonSchema,
} from "@/application/services/season-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const getSeasonProgramConfigurationWorkspace = createServerFn({
  method: "GET",
}).handler(async () => getSeasonProgramConfiguration(await resolveActor()));

export const createSeasonRecord = createServerFn({ method: "POST" })
  .validator(createSeasonSchema)
  .handler(async ({ data }) => createSeason(await resolveActor(), data));

export const updateSeasonRecord = createServerFn({ method: "POST" })
  .validator(updateSeasonSchema)
  .handler(async ({ data }) => updateSeason(await resolveActor(), data));

export const createProgramRecord = createServerFn({ method: "POST" })
  .validator(createProgramSchema)
  .handler(async ({ data }) => createProgram(await resolveActor(), data));

export const updateProgramRecord = createServerFn({ method: "POST" })
  .validator(updateProgramSchema)
  .handler(async ({ data }) => updateProgram(await resolveActor(), data));
