import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdminShell } from "@/features/admin/admin-shell";
import { PlanningDashboard } from "@/features/admin/planning-dashboard";
import { getPlanningDashboard } from "@/server/functions/planning-dashboard";

export const Route = createFileRoute("/admin/")({
  validateSearch: z.object({
    programId: z.uuid().optional(),
    seasonId: z.uuid().optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getPlanningDashboard({ data: deps }),
  component: Page,
  head: () => ({ meta: [{ title: "Planning readiness · Carve" }] }),
});
function Page() {
  return (
    <AdminShell>
      <PlanningDashboard data={Route.useLoaderData()} />
    </AdminShell>
  );
}
