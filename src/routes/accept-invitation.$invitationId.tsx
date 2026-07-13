import { createFileRoute } from "@tanstack/react-router";

import { AcceptInvitationForm } from "@/features/auth/accept-invitation-form";
import { getInvitationPreview } from "@/server/functions/staff-invitations";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  loader: ({ params }) =>
    getInvitationPreview({ data: { invitationId: params.invitationId } }),
  component: AcceptInvitationPage,
  head: () => ({ meta: [{ title: "Accept invitation · Carve" }] }),
});

function AcceptInvitationPage() {
  const preview = Route.useLoaderData();

  return (
    <main className="bg-muted/30 flex min-h-svh items-center justify-center px-6 py-16">
      <section className="bg-background w-full max-w-md rounded-xl border p-8 shadow-sm">
        <div className="mb-8 flex flex-col gap-2">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg font-semibold">
            C
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Accept your invitation
          </h1>
          <p className="text-muted-foreground text-sm">
            Create your staff account or sign in to join your organization.
          </p>
        </div>
        <AcceptInvitationForm preview={preview} />
      </section>
    </main>
  );
}
