import { createServerFn } from "@tanstack/react-start";

import {
  instructorAuditHistorySchema,
  listInstructorAuditHistory,
  listStudentAuditHistory,
  rosterAuditSearchSchema,
  searchRosterAuditHistory as searchRosterAuditHistoryInService,
  studentAuditHistorySchema,
} from "@/application/services/audit-history-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const getStudentAuditHistory = createServerFn({ method: "GET" })
  .validator(studentAuditHistorySchema)
  .handler(async ({ data }) =>
    listStudentAuditHistory(await resolveActor(), data),
  );

export const getInstructorAuditHistory = createServerFn({ method: "GET" })
  .validator(instructorAuditHistorySchema)
  .handler(async ({ data }) =>
    listInstructorAuditHistory(await resolveActor(), data),
  );

export const searchRosterAuditHistory = createServerFn({ method: "GET" })
  .validator(rosterAuditSearchSchema)
  .handler(async ({ data }) =>
    searchRosterAuditHistoryInService(await resolveActor(), data),
  );
