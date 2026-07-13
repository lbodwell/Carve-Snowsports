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
import { getStaffSession } from "@/server/functions/session";

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => setIsHydrated(true), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "The email or password is incorrect.");
        return;
      }

      if (redirectTo) {
        window.location.assign(redirectTo);
        return;
      }

      const session = await getStaffSession();
      window.location.assign(
        session ? getStaffHomePath(session.role as Role) : "/admin",
      );
    } catch {
      setError("Carve could not sign you in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" size="lg" disabled={!isHydrated || isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
        <Link
          to="/forgot-password"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          Forgot your password?
        </Link>
      </FieldGroup>
    </form>
  );
}
