import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/features/auth/auth-client";

export function ResetPasswordForm() {
  const { error, token } = useSearch({ from: "/reset-password" });
  const [isHydrated, setIsHydrated] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => setIsHydrated(true), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setMessage(null);

    if (!token) {
      setFormError("This reset link is invalid or has expired.");
      return;
    }
    if (password.length < 8) {
      setFormError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        setFormError(
          result.error.message ??
            "Carve could not reset your password. Request a new link and try again.",
        );
        return;
      }
      setMessage(
        "Your password was updated. You can sign in with the new password.",
      );
    } catch {
      setFormError(
        "Carve could not reset your password. Request a new link and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (error === "INVALID_TOKEN" || !token) {
    return (
      <div className="flex flex-col gap-4">
        <FieldError>
          This reset link is invalid or has expired. Request a new one to
          continue.
        </FieldError>
        <Button asChild size="lg">
          <Link to="/forgot-password">Request a new reset link</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        {formError ? <FieldError>{formError}</FieldError> : null}
        {message ? (
          <p className="text-muted-foreground text-sm">{message}</p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          disabled={!isHydrated || isSubmitting || Boolean(message)}
        >
          {isSubmitting ? "Updating password…" : "Update password"}
        </Button>
        {message ? (
          <Button asChild variant="outline" size="lg">
            <Link to="/sign-in">Continue to sign in</Link>
          </Button>
        ) : (
          <Link
            to="/sign-in"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        )}
      </FieldGroup>
    </form>
  );
}
