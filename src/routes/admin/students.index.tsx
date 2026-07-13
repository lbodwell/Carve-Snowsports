import { createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { StudentRoster } from "@/features/admin/student-roster";
import { getAdminWorkspace } from "@/server/functions/admin-roster";

export const Route = createFileRoute("/admin/students/")({
  loader: () => getAdminWorkspace(),
  component: StudentRosterPage,
  head: () => ({ meta: [{ title: "Students · Carve" }] }),
});

function StudentRosterPage() {
  const workspace = Route.useLoaderData();

  return (
    <AdminShell>
      <StudentRoster students={workspace.students} />
    </AdminShell>
  );
}
