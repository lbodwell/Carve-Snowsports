import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { StaffInvitationsPanel } from "@/features/admin/staff-invitations-panel";
import { getStaffInvitations } from "@/server/functions/staff-invitations";
import { getStaffSession } from "@/server/functions/session";

export const Route = createFileRoute("/admin/staff")({
  beforeLoad: async () => {
    const session = await getStaffSession();
    if (!session || session.role !== "admin") {
      throw redirect({ to: "/admin" });
    }
  },
  loader: () => getStaffInvitations(),
  component: StaffPage,
  head: () => ({ meta: [{ title: "Staff access · Carve" }] }),
});

function StaffPage() {
  const invitations = Route.useLoaderData();

  return (
    <AdminShell>
      <StaffInvitationsPanel initialInvitations={invitations} />
    </AdminShell>
  );
}
