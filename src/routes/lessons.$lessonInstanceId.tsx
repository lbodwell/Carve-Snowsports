import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminShell } from "@/features/admin/admin-shell";
import { InstructorLessonDetail } from "@/features/lessons/instructor-lessons";
import { getLessonInstanceRoster } from "@/server/functions/lessons";
import { getStaffSession } from "@/server/functions/session";

export const Route = createFileRoute("/lessons/$lessonInstanceId")({
  beforeLoad: async () => {
    const session = await getStaffSession();
    if (!session) {
      throw redirect({ to: "/sign-in" });
    }
    if (session.role !== "instructor") {
      throw redirect({ to: "/admin" });
    }
  },
  loader: ({ params }) =>
    getLessonInstanceRoster({
      data: { lessonInstanceId: params.lessonInstanceId },
    }),
  component: LessonDetailPage,
  head: () => ({ meta: [{ title: "Lesson roster · Carve" }] }),
});

function LessonDetailPage() {
  const { lesson, roster } = Route.useLoaderData();
  return (
    <AdminShell>
      <InstructorLessonDetail lesson={lesson} roster={roster} />
    </AdminShell>
  );
}
