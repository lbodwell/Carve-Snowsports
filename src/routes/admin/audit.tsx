import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminShell } from "@/features/admin/admin-shell";
import { RosterAuditSearch } from "@/features/admin/roster-audit-search";
import { searchRosterAuditHistory } from "@/server/functions/audit-history";

const auditSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce
    .number()
    .refine((n) => [10, 25, 50, 100].includes(n))
    .catch(10),
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
        limit: deps.search.pageSize + 1,
        offset: (deps.search.page - 1) * deps.search.pageSize,
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
        events={events.slice(0, search.pageSize)}
        page={search.page}
        pageSize={search.pageSize}
        hasNext={events.length > search.pageSize}
      />
    </AdminShell>
  );
}
