import { createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { SeasonProgramConfiguration } from "@/features/admin/season-program-configuration";
import { getSeasonProgramConfigurationWorkspace } from "@/server/functions/season-program";

export const Route = createFileRoute("/admin/seasons")({
  loader: () => getSeasonProgramConfigurationWorkspace(),
  component: SeasonsPage,
  head: () => ({ meta: [{ title: "Seasons & programs · Carve" }] }),
});

function SeasonsPage() {
  const { seasons } = Route.useLoaderData();

  return (
    <AdminShell>
      <SeasonProgramConfiguration seasons={seasons} />
    </AdminShell>
  );
}
