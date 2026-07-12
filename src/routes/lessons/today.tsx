import { createFileRoute } from "@tanstack/react-router";

import { AttendanceRoster } from "@/features/lessons/attendance-roster";

export const Route = createFileRoute("/lessons/today")({
  component: TodaysLessonPage,
  head: () => ({ meta: [{ title: "Today’s lesson · Carve" }] }),
});

function TodaysLessonPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <AttendanceRoster />
    </main>
  );
}
