import { Link, createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { ProgramConfigurationEditor } from "@/features/admin/program-configuration-editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProgramConfigurationWorkspace } from "@/server/functions/program-configuration";

export const Route = createFileRoute("/admin/programs/$programId")({
  loader: ({ params }) =>
    getProgramConfigurationWorkspace({ data: { programId: params.programId } }),
  component: ProgramConfigurationPage,
  head: () => ({ meta: [{ title: "Program configuration · Carve" }] }),
});

function ProgramConfigurationPage() {
  const workspace = Route.useLoaderData();

  if (!workspace.program) {
    return (
      <AdminShell>
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">Program unavailable</h1>
            </CardTitle>
            <CardDescription>
              This program may have been removed or is not in your organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/admin/seasons">Back to seasons</Link>
            </Button>
          </CardContent>
        </Card>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <ProgramConfigurationEditor
        programId={workspace.program.id}
        program={workspace.program}
        season={workspace.season}
        disciplines={workspace.disciplines}
        abilityLevels={workspace.abilityLevels}
        ageBands={workspace.ageBands}
        timeSlots={workspace.timeSlots}
      />
    </AdminShell>
  );
}
