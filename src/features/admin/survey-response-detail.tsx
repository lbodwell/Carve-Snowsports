import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SurveyMatchReview } from "./survey-match-review";
import {
  confirmParentSurveyMatch,
  getParentSurveyResponseDetail,
} from "@/server/functions/surveys";
import { surveyLifts } from "@/domain/surveys/pre-lesson-intake";
import { Button } from "@/components/ui/button";

export function SurveyResponseDetail({ responseId }: { responseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getParentSurveyResponseDetail>
  > | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    getParentSurveyResponseDetail({ data: { responseId } })
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        if (active) setError("Could not load response details.");
      });
    return () => {
      active = false;
    };
  }, [responseId, attempt]);
  if (error)
    return (
      <div role="alert">
        {error}
        <Button
          variant="outline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry
        </Button>
      </div>
    );
  if (!data) return <p role="status">Loading response details…</p>;
  return (
    <div className="space-y-3 sm:col-span-2">
      {message && <p role="status">{message}</p>}
      <SurveyMatchReview
        response={data}
        programs={[]}
        students={data.students}
        busy={busy}
        onConfirm={async (studentId, fillMissingBirthDate) => {
          setBusy(true);
          setMessage("");
          try {
            await confirmParentSurveyMatch({
              data: { responseId, studentId, fillMissingBirthDate },
            });
            setAttempt((value) => value + 1);
            await router.invalidate();
            setMessage("Student match confirmed.");
          } catch (confirmationError) {
            setMessage(
              confirmationError instanceof Error
                ? confirmationError.message
                : "Confirmation failed.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Comfortable lifts</dt>
          <dd>
            {data.answers.lifts
              .map(
                (key) =>
                  surveyLifts.find((item) => item.key === key)?.label ?? key,
              )
              .join(", ")}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Medical concerns</dt>
          <dd className="whitespace-pre-wrap">
            {data.answers.medicalConcerns || "None provided"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Additional information</dt>
          <dd className="whitespace-pre-wrap">
            {data.answers.additionalInformation || "None provided"}
          </dd>
        </div>
      </dl>
      {data.enrichmentIssues.length > 0 && (
        <div className="rounded border border-amber-400 p-3">
          <strong>Enrichment needs review</strong>
          <ul>
            {data.enrichmentIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
