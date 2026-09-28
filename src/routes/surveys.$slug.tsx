import { createFileRoute } from "@tanstack/react-router";

import { PreLessonSurveyForm } from "@/features/surveys/pre-lesson-survey-form";
import { getPublicSurveyPage } from "@/server/functions/surveys";

export const Route = createFileRoute("/surveys/$slug")({
  loader: ({ params }) => getPublicSurveyPage({ data: { slug: params.slug } }),
  component: AnonymousSurveyPage,
  head: () => ({ meta: [{ title: "Student survey · Pleasant Mountain" }] }),
});

function AnonymousSurveyPage() {
  const preview = Route.useLoaderData();
  return (
    <main className="flex min-h-svh justify-center bg-[#f6f5ee] px-4 py-10 sm:px-6 sm:py-16">
      <PreLessonSurveyForm preview={preview} />
    </main>
  );
}
