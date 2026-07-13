import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { getStaffSession } from "@/server/functions/session";

const resetPasswordSearchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  beforeLoad: async () => {
    if (await getStaffSession()) {
      throw redirect({ to: "/admin" });
    }
  },
  component: ResetPasswordPage,
  head: () => ({ meta: [{ title: "Choose a new password · Carve" }] }),
});

function ResetPasswordPage() {
  return (
    <main className="bg-muted/30 flex min-h-svh items-center justify-center px-6 py-16">
      <section className="bg-background w-full max-w-md rounded-xl border p-8 shadow-sm">
        <div className="mb-8 flex flex-col gap-2">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg font-semibold">
            C
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Choose a new password
          </h1>
          <p className="text-muted-foreground text-sm">
            Use a strong password you have not used elsewhere.
          </p>
        </div>
        <ResetPasswordForm />
      </section>
    </main>
  );
}
