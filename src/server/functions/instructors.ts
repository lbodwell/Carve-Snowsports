import { createServerFn } from "@tanstack/react-start";

import {
  archiveInstructor as archiveInstructorInService,
  archiveInstructorSchema,
  getInstructorPreferences,
  instructorInputSchema,
  listInstructors,
  saveInstructor as saveInstructorInService,
  saveInstructorPreferences,
  saveInstructorPreferencesSchema,
} from "@/application/services/instructor-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const getInstructors = createServerFn({ method: "GET" }).handler(
  async () => listInstructors(await resolveActor()),
);

export const saveInstructor = createServerFn({ method: "POST" })
  .validator(instructorInputSchema)
  .handler(async ({ data }) =>
    saveInstructorInService(await resolveActor(), data),
  );

export const archiveInstructor = createServerFn({ method: "POST" })
  .validator(archiveInstructorSchema)
  .handler(async ({ data }) =>
    archiveInstructorInService(await resolveActor(), data),
  );

export const loadInstructorPreferences = createServerFn({ method: "GET" })
  .validator(archiveInstructorSchema)
  .handler(async ({ data }) =>
    getInstructorPreferences(await resolveActor(), data.instructorId),
  );
export const updateInstructorPreferences = createServerFn({ method: "POST" })
  .validator(saveInstructorPreferencesSchema)
  .handler(async ({ data }) =>
    saveInstructorPreferences(await resolveActor(), data),
  );
