import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import type { Role } from "@/application/policies/authorization";
import { groupingViewSchema } from "@/domain/grouping/workspace-query";
import {
  getStaffHomePath,
  hasPermission,
} from "@/application/policies/authorization";
import { AdminShell } from "@/features/admin/admin-shell";
import { PersistedGroupingBoard } from "@/features/grouping/persisted-grouping-board";
import { getGroupingWorkspace } from "@/server/functions/grouping-draft";
import { getStaffSession } from "@/server/functions/session";
import { getRegistrationImportWorkspace } from "@/server/functions/registration-import";

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
  validateSearch: groupingViewSchema,
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: async ({ deps }) =>
    (await getRegistrationImportWorkspace()).length
      ? getGroupingWorkspace({ data: deps })
      : null,
  component: GroupingPage,
  head: () => ({ meta: [{ title: "Build lesson groups · Carve" }] }),
});

function GroupingPage() {
  const workspace = Route.useLoaderData();
  const filters = Route.useSearch();
  return (
    <AdminShell>
      {workspace ? (
        <PersistedGroupingBoard
          key={workspace.program.id}
          workspace={workspace}
          initialFilters={filters}
        />
      ) : (
        <section className="rounded-xl border bg-white p-8">
          <h1 className="text-2xl font-semibold">Set up your lesson program</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Create a season and program, then import students and add
            instructors to begin building groups.
          </p>
          <Link
            className="text-pm-green mt-4 inline-block font-medium underline"
            to="/admin/seasons"
          >
            Create a season and program
          </Link>
        </section>
      )}
    </AdminShell>
  );
}
