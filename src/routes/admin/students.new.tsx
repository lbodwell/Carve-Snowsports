import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminShell } from "@/features/admin/admin-shell";
import { NewStudentForm } from "@/features/admin/new-student-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAdminWorkspace,
  getRegistrationWorkspace,
} from "@/server/functions/admin-roster";

export const Route = createFileRoute("/admin/students/new")({
  validateSearch: z.object({ programId: z.uuid().optional() }),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) =>
    deps.programId
      ? getRegistrationWorkspace({ data: deps })
      : getAdminWorkspace(),
  component: NewStudentPage,
  head: () => ({ meta: [{ title: "New student · Carve" }] }),
});

function NewStudentPage() {
  const workspace = Route.useLoaderData();
  const navigate = Route.useNavigate();

  return (
    <AdminShell>
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">Add student</h1>
            </CardTitle>
            <CardDescription>
              Add a student to the roster and register them in the active
              program.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewStudentForm
              disciplines={workspace.disciplines}
              abilityLevels={workspace.abilityLevels}
              programName={workspace.program?.name ?? null}
              programId={workspace.program?.id}
              onCreated={() =>
                navigate({
                  to: "/admin/students",
                  search: { programId: workspace.program?.id },
                })
              }
            />
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
