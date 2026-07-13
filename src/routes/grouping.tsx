import { createFileRoute, redirect } from "@tanstack/react-router";

import type { Role } from "@/application/policies/authorization";
import {
  getStaffHomePath,
  hasPermission,
} from "@/application/policies/authorization";
import { AdminShell } from "@/features/admin/admin-shell";
import { PersistedGroupingBoard } from "@/features/grouping/persisted-grouping-board";
import { getGroupingWorkspace } from "@/server/functions/grouping-draft";
import { getStaffSession } from "@/server/functions/session";

export const Route = createFileRoute("/grouping")({
  beforeLoad: async () => {
    const session = await getStaffSession();
    if (!session) {
      throw redirect({ to: "/sign-in" });
    }
    if (!hasPermission({ role: session.role as Role }, "grouping:edit")) {
      throw redirect({ to: getStaffHomePath(session.role as Role) });
    }
  },
  loader: () => getGroupingWorkspace(),
  component: GroupingPage,
  head: () => ({ meta: [{ title: "Build lesson groups · Carve" }] }),
});

function GroupingPage() {
  const workspace = Route.useLoaderData();
  return (
    <AdminShell>
      <PersistedGroupingBoard workspace={workspace} />
    </AdminShell>
  );
}
