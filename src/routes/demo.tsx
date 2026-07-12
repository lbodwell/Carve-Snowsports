import { createFileRoute } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDemoRoster } from "@/server/functions/demo";

export const Route = createFileRoute("/demo")({
  loader: () => getDemoRoster(),
  component: DemoPage,
  head: () => ({ meta: [{ title: "Demo data · Carve" }] }),
});

function DemoPage() {
  const { organization, students } = Route.useLoaderData();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-primary text-sm font-medium">
          Local PostgreSQL demo
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {organization?.name ?? "Demo data not seeded"}
        </h1>
        <p className="text-muted-foreground">
          This roster is loaded from the local Postgres container, not browser
          mock data.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Students</CardTitle>
          <CardDescription>{students.length} synthetic records</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {students.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Run <code>bun run db:seed</code> to load the local demo data.
            </p>
          ) : (
            students.map((student) => (
              <article
                key={`${student.firstName}-${student.lastName}`}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <span className="font-medium">
                  {student.firstName} {student.lastName}
                </span>
                <Badge variant="outline">
                  {student.dateOfBirth ?? "No date of birth"}
                </Badge>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
