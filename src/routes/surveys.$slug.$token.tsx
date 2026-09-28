import { createFileRoute } from "@tanstack/react-router";

import { PreLessonSurveyForm } from "@/features/surveys/pre-lesson-survey-form";
import { getPublicSurveyPage } from "@/server/functions/surveys";

export const Route = createFileRoute("/surveys/$slug/$token")({
  loader: ({ params }) =>
    getPublicSurveyPage({
      data: { slug: params.slug, token: params.token },
    }),
  component: InvitedSurveyPage,
  head: () => ({ meta: [{ title: "Student survey · Pleasant Mountain" }] }),
});

function InvitedSurveyPage() {
  const preview = Route.useLoaderData();
  const { token } = Route.useParams();
  return (
    <main className="flex min-h-svh justify-center bg-[#f6f5ee] px-4 py-10 sm:px-6 sm:py-16">
      <PreLessonSurveyForm preview={preview} token={token} />
    </main>
  );
}
