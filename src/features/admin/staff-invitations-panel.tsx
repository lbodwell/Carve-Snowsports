import { useState } from "react";

import type { Role } from "@/application/policies/authorization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StaffInvitationForm } from "@/features/admin/staff-invitation-form";
import {
  cancelStaffInvite,
  getStaffInvitations,
} from "@/server/functions/staff-invitations";

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | Date;
  createdAt: string | Date;
};

const roleLabels: Record<Role, string> = {
  admin: "Administrator",
  coordinator: "Coordinator",
  instructor: "Instructor",
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function StaffInvitationsPanel({
  initialInvitations,
}: {
  initialInvitations: Array<Invitation>;
}) {
  const [invitations, setInvitations] =
    useState<Array<Invitation>>(initialInvitations);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function refreshInvitations() {
    const nextInvitations = await getStaffInvitations();
    setInvitations(nextInvitations);
  }

  async function handleCancel(invitationId: string) {
    setCancellingId(invitationId);
    try {
      await cancelStaffInvite({ data: { invitationId } });
      await refreshInvitations();
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Staff access</h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          Invite coordinators and instructors by email. Invitations expire after
          seven days and can be resent by sending a new invite to the same
          address.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Send invitation</CardTitle>
            <CardDescription>
              In development, invitation links are logged to the server console.
              Production requires `RESEND_API_KEY` and `EMAIL_FROM`; invites
              fail instead of creating a link nobody receives.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StaffInvitationForm onCreated={refreshInvitations} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invitation history</CardTitle>
            <CardDescription>
              Pending, accepted, and cancelled invitations for your
              organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No invitations have been sent yet.
              </p>
            ) : (
              <div className="rounded-xl border">
                <Table className="min-w-[36rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitations.map((invitation) => (
                      <TableRow key={invitation.id}>
                        <TableCell>{invitation.email}</TableCell>
                        <TableCell>
                          {roleLabels[invitation.role as Role]}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{invitation.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(invitation.expiresAt)}
                        </TableCell>
                        <TableCell>
                          {invitation.status === "pending" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={cancellingId === invitation.id}
                              onClick={() => handleCancel(invitation.id)}
                            >
                              {cancellingId === invitation.id
                                ? "Cancelling…"
                                : "Cancel"}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
