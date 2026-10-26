import { createFileRoute } from "@tanstack/react-router";
import { surveyResponseQuerySchema } from "@/domain/surveys/response-query";

import { AdminShell } from "@/features/admin/admin-shell";
import { SurveyWorkspace } from "@/features/admin/survey-workspace";
import { getAdminSurveyWorkspace } from "@/server/functions/surveys";

export const Route = createFileRoute("/admin/surveys")({
  validateSearch: (input) => surveyResponseQuerySchema.parse(input),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getAdminSurveyWorkspace({ data: deps }),
  component: SurveyAdminPage,
  head: () => ({ meta: [{ title: "Parent surveys · Pleasant Mountain" }] }),
});

function SurveyAdminPage() {
  const workspace = Route.useLoaderData();
  return (
    <AdminShell>
      <SurveyWorkspace workspace={workspace} />
    </AdminShell>
  );
}
