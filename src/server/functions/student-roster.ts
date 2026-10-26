import { createServerFn } from "@tanstack/react-start";

import {
  archiveStudent as archiveStudentInService,
  archiveStudentSchema,
  createStudentRegistration,
  createStudentRegistrationSchema,
  registerStudent as registerStudentInService,
  registerStudentSchema,
  reviewSurveySupport as reviewSurveySupportInService,
  reviewSurveySupportSchema,
  updateStudent as updateStudentInService,
  updateStudentSchema,
} from "@/application/services/student-roster-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const reviewSurveySupport = createServerFn({ method: "POST" })
  .validator(reviewSurveySupportSchema)
  .handler(async ({ data }) =>
    reviewSurveySupportInService(await resolveActor(), data),
  );

export const createStudent = createServerFn({ method: "POST" })
  .validator(createStudentRegistrationSchema)
  .handler(async ({ data }) =>
    createStudentRegistration(await resolveActor(), data),
  );

export const registerStudent = createServerFn({ method: "POST" })
  .validator(registerStudentSchema)
  .handler(async ({ data }) =>
    registerStudentInService(await resolveActor(), data),
  );

export const updateStudent = createServerFn({ method: "POST" })
  .validator(updateStudentSchema)
  .handler(async ({ data }) =>
    updateStudentInService(await resolveActor(), data),
  );

export const archiveStudent = createServerFn({ method: "POST" })
  .validator(archiveStudentSchema)
  .handler(async ({ data }) =>
    archiveStudentInService(await resolveActor(), data),
  );
