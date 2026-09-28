import { useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { AuditHistoryPanel } from "@/features/admin/audit-history-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchRosterAuditHistory } from "@/server/functions/audit-history";

type RosterAuditEvent = {
  id: string;
  action: string;
  summary: string;
  actorLabel: string;
  createdAt: string;
  entityType: string;
  entityId: string;
  subjectLabel: string;
  subjectHref: string | null;
};

const entityTypeOptions = [
  { value: "all", label: "All roster records" },
  { value: "student", label: "Students" },
  { value: "instructor", label: "Instructors" },
  { value: "registration", label: "Registrations" },
] as const;

export function RosterAuditSearch({
  initialQuery = "",
  initialEntityType = "all",
  events,
}: {
  initialQuery?: string;
  initialEntityType?: (typeof entityTypeOptions)[number]["value"];
  events: Array<RosterAuditEvent>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [entityType, setEntityType] =
    useState<(typeof entityTypeOptions)[number]["value"]>(initialEntityType);
  const [results, setResults] = useState(events);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setBusy(true);
    setError(null);
    try {
      const nextResults = await searchRosterAuditHistory({
        data: {
          query: query.trim() || undefined,
          entityType,
          limit: 50,
        },
      });
      setResults(nextResults);
      void router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Audit history could not be searched.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="bg-card rounded-xl border p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Roster audit</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Search people changes across students, instructors, and registrations.
          Sensitive field values are never stored in audit metadata.
        </p>
      </header>

      <form
        className="bg-card grid gap-4 rounded-xl border p-5 md:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="audit-query">Search</Label>
          <Input
            id="audit-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, action, or staff member"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-entity-type">Record type</Label>
          <Select
            value={entityType}
            onValueChange={(value) =>
              setEntityType(
                value as (typeof entityTypeOptions)[number]["value"],
              )
            }
          >
            <SelectTrigger id="audit-entity-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entityTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Searching…" : "Search"}
          </Button>
        </div>
      </form>

      {error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      <AuditHistoryPanel
        title="Results"
        description="Most recent matching roster events, newest first."
        events={results}
      />
    </div>
  );
}
