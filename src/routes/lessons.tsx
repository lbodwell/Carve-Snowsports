import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { InstructorLessonSchedule } from "@/features/lessons/instructor-lessons";
import { getInstructorLessonSchedule } from "@/server/functions/lessons";
import { getStaffSession } from "@/server/functions/session";

export const Route = createFileRoute("/lessons")({
  beforeLoad: async () => {
    const session = await getStaffSession();
    if (!session) {
      throw redirect({ to: "/sign-in" });
    }
    if (session.role !== "instructor") {
      throw redirect({ to: "/admin" });
    }
  },
  loader: () => getInstructorLessonSchedule(),
  component: LessonsPage,
  head: () => ({ meta: [{ title: "Lessons · Carve" }] }),
});

function LessonsPage() {
  const { lessons } = Route.useLoaderData();
  return (
    <AdminShell>
      <InstructorLessonSchedule lessons={lessons} />
    </AdminShell>
  );
}
