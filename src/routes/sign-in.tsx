import { createFileRoute, redirect } from "@tanstack/react-router";

import type { Role } from "@/application/policies/authorization";
import { getStaffHomePath } from "@/application/policies/authorization";
import { SignInForm } from "@/features/auth/sign-in-form";
import { getStaffSession } from "@/server/functions/session";

type SignInSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async () => {
    const session = await getStaffSession();
    if (session) {
      throw redirect({ to: getStaffHomePath(session.role as Role) });
    }
  },
  component: SignInPage,
  head: () => ({ meta: [{ title: "Sign in · Carve" }] }),
});

function SignInPage() {
  const { redirect: redirectTo } = Route.useSearch();

  return (
    <main className="bg-muted/30 flex min-h-svh items-center justify-center px-6 py-16">
      <section className="bg-background w-full max-w-md rounded-xl border p-8 shadow-sm">
        <div className="mb-8 flex flex-col gap-2">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg font-semibold">
            C
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Sign in to Carve
          </h1>
          <p className="text-muted-foreground text-sm">
            Use the staff account provided by your administrator.
          </p>
        </div>
        <SignInForm redirectTo={redirectTo} />
      </section>
    </main>
  );
}
