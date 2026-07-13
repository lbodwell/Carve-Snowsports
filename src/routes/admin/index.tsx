import { createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { AdminWorkspace } from "@/features/admin/admin-workspace";
import { getAdminWorkspace } from "@/server/functions/admin-roster";

export const Route = createFileRoute("/admin/")({
  loader: () => getAdminWorkspace(),
  component: AdminOverviewPage,
  head: () => ({ meta: [{ title: "Season operations · Carve" }] }),
});

function AdminOverviewPage() {
  const workspace = Route.useLoaderData();

  return (
    <AdminShell>
      <AdminWorkspace workspace={workspace} />
    </AdminShell>
  );
}
