import { createFileRoute, redirect } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { getStaffSession } from "@/server/functions/session";

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: async () => {
    if (await getStaffSession()) {
      throw redirect({ to: "/admin" });
    }
  },
  component: ForgotPasswordPage,
  head: () => ({ meta: [{ title: "Reset password · Carve" }] }),
});

function ForgotPasswordPage() {
  return (
    <main className="bg-muted/30 flex min-h-svh items-center justify-center px-6 py-16">
      <section className="bg-background w-full max-w-md rounded-xl border p-8 shadow-sm">
        <div className="mb-8 flex flex-col gap-2">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg font-semibold">
            C
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Reset your password
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter the email address associated with your staff account.
          </p>
        </div>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
