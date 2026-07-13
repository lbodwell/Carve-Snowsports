import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => setIsHydrated(true), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          redirectTo: "/reset-password",
        }),
      });
      if (!response.ok) {
        setError("Carve could not send a reset link. Please try again.");
        return;
      }
      setMessage(
        "If this email exists in our system, check your inbox for a reset link.",
      );
    } catch {
      setError("Carve could not send a reset link. Please try again.");
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
          <FieldDescription>
            We will send a secure link if this address belongs to a staff
            account.
          </FieldDescription>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        {message ? (
          <p className="text-muted-foreground text-sm">{message}</p>
        ) : null}
        <Button type="submit" size="lg" disabled={!isHydrated || isSubmitting}>
          {isSubmitting ? "Sending reset link…" : "Send reset link"}
        </Button>
        <Link
          to="/sign-in"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </FieldGroup>
    </form>
  );
}
