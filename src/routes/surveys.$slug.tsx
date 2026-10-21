import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { PreLessonSurveyForm } from "@/features/surveys/pre-lesson-survey-form";
import { getPublicSurveyPage } from "@/server/functions/surveys";

export const Route = createFileRoute("/surveys/$slug")({
  loader: ({ params, location }) =>
    location.pathname.replace(/\/$/, "") === `/surveys/${params.slug}`
      ? getPublicSurveyPage({ data: { slug: params.slug } })
      : null,
  component: AnonymousSurveyPage,
  head: () => ({ meta: [{ title: "Student survey · Pleasant Mountain" }] }),
});

function AnonymousSurveyPage() {
  const matchRoute = useMatchRoute();
  const { slug } = Route.useParams();
  const preview = Route.useLoaderData();
  if (!matchRoute({ to: "/surveys/$slug", params: { slug }, fuzzy: false }))
    return <Outlet />;
  if (!preview) return null;
  return (
    <main className="flex min-h-svh justify-center bg-[#f6f5ee] px-4 py-10 sm:px-6 sm:py-16">
      <PreLessonSurveyForm preview={preview} />
    </main>
  );
}
