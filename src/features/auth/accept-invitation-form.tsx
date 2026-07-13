import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import type { Role } from "@/application/policies/authorization";
import { getStaffHomePath } from "@/application/policies/authorization";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/features/auth/auth-client";
import { acceptInvitation } from "@/server/functions/staff-invitations";

type InvitationPreview = {
  invitationId: string;
  organizationName: string;
  email: string;
  role: Role;
  requiresAccount: boolean;
  expiresAt: string;
};

const roleLabels: Record<Role, string> = {
  admin: "Administrator",
  coordinator: "Coordinator",
  instructor: "Instructor",
};

export function AcceptInvitationForm({
  preview,
}: {
  preview: InvitationPreview;
}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => setIsHydrated(true), []);

  useEffect(() => {
    void authClient.getSession().then((result) => {
      setIsSignedIn(Boolean(result.data?.user));
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (preview.requiresAccount) {
      if (password.length < 8) {
        setError("Use at least 8 characters for your password.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const result = await acceptInvitation({
        data: {
          invitationId: preview.invitationId,
          name: preview.requiresAccount ? name : undefined,
          password: preview.requiresAccount ? password : undefined,
        },
      });

      if (preview.requiresAccount) {
        const signInResult = await authClient.signIn.email({
          email: result.email,
          password,
        });
        if (signInResult.error) {
          setError(
            "Your account was created, but sign-in failed. Try signing in manually.",
          );
          return;
        }
      }

      window.location.assign(getStaffHomePath(result.role));
    } catch {
      setError(
        preview.requiresAccount
          ? "Carve could not create your account from this invitation."
          : "Carve could not accept this invitation. Sign in with the invited email and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!preview.requiresAccount && !isSignedIn) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Sign in with <strong>{preview.email}</strong> to accept this
          invitation for {preview.organizationName}.
        </p>
        <Button asChild size="lg">
          <Link
            to="/sign-in"
            search={{ redirect: `/accept-invitation/${preview.invitationId}` }}
          >
            Sign in to accept
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Join <strong>{preview.organizationName}</strong> as a{" "}
          {roleLabels[preview.role].toLowerCase()}.
        </p>
        {preview.requiresAccount ? (
          <>
            <Field>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                autoFocus
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" value={preview.email} readOnly />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">
                Confirm password
              </FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Signed in as <strong>{preview.email}</strong>.
          </p>
        )}
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" size="lg" disabled={!isHydrated || isSubmitting}>
          {isSubmitting ? "Accepting invitation…" : "Accept invitation"}
        </Button>
      </FieldGroup>
    </form>
  );
}
