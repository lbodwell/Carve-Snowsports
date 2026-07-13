import { createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { InstructorRoster } from "@/features/admin/instructor-roster";
import { getInstructors } from "@/server/functions/instructors";

export const Route = createFileRoute("/admin/instructors")({
  loader: () => getInstructors(),
  component: InstructorRosterPage,
  head: () => ({ meta: [{ title: "Instructors · Carve" }] }),
});

function InstructorRosterPage() {
  const instructors = Route.useLoaderData();
  return (
    <AdminShell>
      <InstructorRoster instructors={instructors} />
    </AdminShell>
  );
}
