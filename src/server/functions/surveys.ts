import { createServerFn } from "@tanstack/react-start";

import {
  addSurveyInvitation,
  addSurveyInvitationSchema,
  generateSurveyInvitations,
  getPublicSurvey,
  getSurveyWorkspace,
  publicSurveyRequestSchema,
  submitPublicSurvey,
  submitPublicSurveySchema,
  surveyIdSchema,
  updateSurveyAccess,
  updateSurveyAccessSchema,
} from "@/application/services/survey-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";
import {
  confirmSurveyMatch,
  confirmSurveyMatchSchema,
  refreshSurveyMatches,
} from "@/application/services/survey-matching-service.server";

export const reconcileParentSurveyMatches = createServerFn({
  method: "POST",
}).handler(async () => refreshSurveyMatches(await resolveActor()));
export const confirmParentSurveyMatch = createServerFn({ method: "POST" })
  .validator(confirmSurveyMatchSchema)
  .handler(async ({ data }) => confirmSurveyMatch(await resolveActor(), data));

export const getPublicSurveyPage = createServerFn({ method: "GET" })
  .validator(publicSurveyRequestSchema)
  .handler(({ data }) => getPublicSurvey(data));

export const submitSurveyResponse = createServerFn({ method: "POST" })
  .validator(submitPublicSurveySchema)
  .handler(({ data }) => submitPublicSurvey(data));

export const getAdminSurveyWorkspace = createServerFn({
  method: "GET",
}).handler(async () => getSurveyWorkspace(await resolveActor()));

export const addParentSurveyInvitation = createServerFn({ method: "POST" })
  .validator(addSurveyInvitationSchema)
  .handler(async ({ data }) => addSurveyInvitation(await resolveActor(), data));

export const generateParentSurveyInvitations = createServerFn({
  method: "POST",
})
  .validator(surveyIdSchema)
  .handler(async ({ data }) =>
    generateSurveyInvitations(await resolveActor(), data),
  );

export const saveSurveyAccess = createServerFn({ method: "POST" })
  .validator(updateSurveyAccessSchema)
  .handler(async ({ data }) => updateSurveyAccess(await resolveActor(), data));
