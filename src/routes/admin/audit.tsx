import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminShell } from "@/features/admin/admin-shell";
import { RosterAuditSearch } from "@/features/admin/roster-audit-search";
import { searchRosterAuditHistory } from "@/server/functions/audit-history";

const auditSearchSchema = z.object({
  query: z.string().optional(),
  entityType: z.enum(["student", "instructor", "registration"]).optional(),
});

export const Route = createFileRoute("/admin/audit")({
  validateSearch: auditSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    searchRosterAuditHistory({
      data: {
        query: deps.search.query,
        entityType: deps.search.entityType ?? "all",
        limit: 50,
      },
    }),
  component: RosterAuditPage,
  head: () => ({ meta: [{ title: "Roster audit · Carve" }] }),
});

function RosterAuditPage() {
  const events = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <AdminShell>
      <RosterAuditSearch
        initialQuery={search.query ?? ""}
        initialEntityType={search.entityType ?? "all"}
        events={events}
      />
    </AdminShell>
  );
}
