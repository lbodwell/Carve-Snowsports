import { createServerFn } from "@tanstack/react-start";

import {
  getInstructorLessonSchedule as getInstructorLessonScheduleInService,
  getLessonInstanceRoster as getLessonInstanceRosterInService,
  getLessonInstanceRosterSchema,
} from "@/application/services/lesson-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const getInstructorLessonSchedule = createServerFn({ method: "GET" }).handler(
  async () => getInstructorLessonScheduleInService(await resolveActor()),
);

export const getLessonInstanceRoster = createServerFn({ method: "GET" })
  .validator(getLessonInstanceRosterSchema)
  .handler(async ({ data }) =>
    getLessonInstanceRosterInService(await resolveActor(), data),
  );
