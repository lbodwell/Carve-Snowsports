import { useState } from "react";
import type { FormEvent } from "react";

import type { Role } from "@/application/policies/authorization";
import { roles } from "@/application/policies/authorization";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteStaffMember } from "@/server/functions/staff-invitations";

const roleLabels: Record<Role, string> = {
  admin: "Administrator",
  coordinator: "Coordinator",
  instructor: "Instructor",
};

export function StaffInvitationForm({
  onCreated,
}: {
  onCreated: () => Promise<void> | void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("coordinator");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await inviteStaffMember({ data: { email, role } });
      setEmail("");
      setRole("coordinator");
      await onCreated();
    } catch {
      setError(
        "Carve could not send the invitation. Check the email and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-role">Role</FieldLabel>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as Role)}
          >
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((option) => (
                <SelectItem key={option} value={option}>
                  {roleLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending invitation…" : "Send invitation"}
        </Button>
      </FieldGroup>
    </form>
  );
}
