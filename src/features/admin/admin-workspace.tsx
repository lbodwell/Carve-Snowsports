import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AdminWorkspace = {
  organization: { id: string; name: string; timezone: string } | null;
  season: {
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    status: string;
  } | null;
  program: { id: string; name: string; status: string } | null;
  students: Array<{ registrationId: string | null }>;
};

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function AdminWorkspace({ workspace }: { workspace: AdminWorkspace }) {
  const registeredStudents = workspace.students.filter(
    (student) => student.registrationId != null,
  ).length;
  const studentsNeedingRegistration =
    workspace.students.length - registeredStudents;

  if (!workspace.organization) {
    return (
      <section className="bg-background rounded-xl border border-dashed p-8">
        <h1 className="text-xl font-semibold">Workspace not configured</h1>
        <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
          Run the local database migration and seed commands to create the
          synthetic organization and roster.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm font-medium">
            {workspace.organization.name}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Season operations
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
            Review the roster and configuration readiness before starting lesson
            grouping.
          </p>
        </div>
        <Badge variant="outline">{workspace.organization.timezone}</Badge>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={CalendarDays}
          label="Active season"
          value={workspace.season?.name ?? "Not configured"}
          detail={
            workspace.season
              ? `${workspace.season.startsOn} to ${workspace.season.endsOn}`
              : "Create a season to set the operating window."
          }
          status={workspace.season?.status}
        />
        <SummaryCard
          icon={UsersRound}
          label="Students"
          value={String(workspace.students.length)}
          detail={
            studentsNeedingRegistration === 0
              ? "All roster records are registered."
              : `${studentsNeedingRegistration} need a program registration.`
          }
        />
        <SummaryCard
          icon={CalendarDays}
          label="Program"
          value={workspace.program?.name ?? "Not configured"}
          detail={
            workspace.program
              ? "Configuration is ready to review."
              : "Create a program before grouping."
          }
          status={workspace.program?.status}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Start with the roster</CardTitle>
          <CardDescription>
            Review synthetic student records, identify incomplete registrations,
            and prepare for the first grouping draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {workspace.students.length} student
              {workspace.students.length === 1 ? "" : "s"}
            </Badge>
            {studentsNeedingRegistration > 0 ? (
              <Badge variant="outline">
                {studentsNeedingRegistration} need registration
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/seasons">Manage seasons</Link>
            </Button>
            <Button asChild>
              <Link to="/admin/students">
                Open student roster
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  detail,
  icon: Icon,
  label,
  status,
  value,
}: {
  detail: string;
  icon: typeof CalendarDays;
  label: string;
  status?: string;
  value: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon aria-hidden />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-lg font-semibold">{value}</p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {detail}
        </p>
        {status ? <Badge variant="outline">{statusLabel(status)}</Badge> : null}
      </CardContent>
    </Card>
  );
}
