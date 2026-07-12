import { createFileRoute } from "@tanstack/react-router";

import { GroupingBoard } from "@/features/grouping/grouping-board";

export const Route = createFileRoute("/grouping")({
  component: GroupingPage,
  head: () => ({ meta: [{ title: "Build lesson groups · Carve" }] }),
});

function GroupingPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <GroupingBoard />
    </main>
  );
}
