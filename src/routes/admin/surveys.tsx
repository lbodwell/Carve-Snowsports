import { createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { SurveyWorkspace } from "@/features/admin/survey-workspace";
import { getAdminSurveyWorkspace } from "@/server/functions/surveys";

export const Route = createFileRoute("/admin/surveys")({
  loader: () => getAdminSurveyWorkspace(),
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
