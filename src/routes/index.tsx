import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex max-w-2xl flex-col gap-4">
        <p className="text-primary text-sm font-medium tracking-wide uppercase">
          Carve operations
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Group planning built for the people running lessons.
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          A production foundation for seasonal registration, explainable group
          drafts, dated lessons, and instructor operations.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3">
        <StatusCard
          title="Foundation"
          description="Routes, testing, migrations, and deployment health are being established."
        />
        <StatusCard
          title="Grouping"
          description="Rules are explicit, versioned, and designed for human review."
        />
        <StatusCard
          title="Privacy"
          description="Sensitive student data is projected by role, not hidden only in the interface."
        />
      </section>
      <Link
        to="/sign-in"
        className="bg-primary text-primary-foreground focus-visible:outline-primary w-fit rounded-md px-4 py-2.5 font-medium outline-offset-4 transition-opacity hover:opacity-90 focus-visible:outline-2"
      >
        Staff sign in
      </Link>
    </main>
  );
}

function StatusCard({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <article className="bg-card flex min-h-36 flex-col gap-2 rounded-lg border p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
    </article>
  );
}
