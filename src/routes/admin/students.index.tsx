import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminShell } from "@/features/admin/admin-shell";
import { StudentRoster } from "@/features/admin/student-roster";
import { getRegistrationWorkspace } from "@/server/functions/admin-roster";

export const Route = createFileRoute("/admin/students/")({
  validateSearch: z.object({ programId: z.uuid().optional() }),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => getRegistrationWorkspace({ data: deps }),
  component: StudentRosterPage,
  head: () => ({ meta: [{ title: "Students · Carve" }] }),
});

function StudentRosterPage() {
  const workspace = Route.useLoaderData();
  const navigate = Route.useNavigate();

  return (
    <AdminShell>
      <StudentRoster
        students={workspace.students}
        programs={workspace.programOptions}
        selectedProgramId={workspace.program?.id ?? ""}
        onProgramChange={(programId) => {
          void navigate({ search: programId ? { programId } : {} });
        }}
        disciplines={workspace.disciplines}
        abilityLevels={workspace.abilityLevels}
      />
    </AdminShell>
  );
}
