import { createFileRoute } from "@tanstack/react-router";

import { getServiceHealth } from "@/server/functions/health";

export const Route = createFileRoute("/health")({
  loader: async () => {
    const health = await getServiceHealth();
    if (!health.ok) {
      throw new Error("Database unavailable");
    }
    return health;
  },
  component: HealthPage,
  head: () => ({ meta: [{ title: "Carve service health" }] }),
});

function HealthPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl items-center px-6">
      <section className="bg-card flex flex-col gap-2 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Service available</h1>
        <p className="text-muted-foreground">
          The Carve application is responding. This endpoint intentionally
          exposes no environment or database details.
        </p>
      </section>
    </main>
  );
}
