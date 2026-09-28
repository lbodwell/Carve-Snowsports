import { createFileRoute } from "@tanstack/react-router";

import { RegistrationImportWorkspace } from "@/features/admin/registration-import-workspace";
import { AdminShell } from "@/features/admin/admin-shell";
import { getRegistrationImportWorkspace } from "@/server/functions/registration-import";

export const Route = createFileRoute("/admin/imports")({
  loader: () => getRegistrationImportWorkspace(),
  component: RegistrationImportPage,
  head: () => ({ meta: [{ title: "Registration import · Carve" }] }),
});

function RegistrationImportPage() {
  const programs = Route.useLoaderData();
  return <AdminShell><RegistrationImportWorkspace programs={programs} /></AdminShell>;
}
