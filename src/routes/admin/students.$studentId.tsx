import { Link, createFileRoute, useRouter } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { AuditHistoryPanel } from "@/features/admin/audit-history-panel";
import { StudentDetailEditor } from "@/features/admin/student-detail-editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStudent } from "@/server/functions/admin-roster";
import { getStudentAuditHistory } from "@/server/functions/audit-history";

export const Route = createFileRoute("/admin/students/$studentId")({
  loader: ({ params }) =>
    Promise.all([
      getStudent({ data: { studentId: params.studentId } }),
      getStudentAuditHistory({ data: { studentId: params.studentId } }),
    ]).then(([studentWorkspace, auditHistory]) => ({
      ...studentWorkspace,
      auditHistory,
    })),
  component: StudentDetailPage,
  head: () => ({ meta: [{ title: "Student details · Carve" }] }),
});

function StudentDetailPage() {
  const { abilityLevels, auditHistory, disciplines, programName, student } =
    Route.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();

  if (!student) {
    return (
      <AdminShell>
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">Student unavailable</h1>
            </CardTitle>
            <CardDescription>
              This student may have been archived or is not in your
              organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/admin/students">Back to students</Link>
            </Button>
          </CardContent>
        </Card>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <StudentDetailEditor
          student={student}
          disciplines={disciplines}
          abilityLevels={abilityLevels}
          programName={programName}
          onSaved={() => {
            void router.invalidate();
          }}
          onArchived={() => navigate({ to: "/admin/students" })}
        />
        <AuditHistoryPanel
          title="Audit history"
          description="Recorded roster changes for this student. Sensitive field values are never stored in audit metadata."
          events={auditHistory}
        />
      </div>
    </AdminShell>
  );
}
