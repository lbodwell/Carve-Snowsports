import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SurveyMatchReview } from "./survey-match-review";
import {
  confirmParentSurveyMatch,
  getParentSurveyResponseDetail,
} from "@/server/functions/surveys";
import { surveyLifts } from "@/domain/surveys/pre-lesson-intake";
import { Button } from "@/components/ui/button";
import { reviewSurveyNote } from "@/server/functions/student-roster";
import { meaningfulSurveyNote } from "@/domain/surveys/survey-notes";

export function SurveyResponseDetail({
  responseId,
  reviewRevision,
}: {
  responseId: string;
  reviewRevision?: string;
}) {
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
    setData(null);
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
  }, [responseId, attempt, reviewRevision]);
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
        onConfirm={async (
          studentId,
          fillMissingBirthDate,
          _programId,
          acknowledgeConflicts,
          reviewEvidenceKey,
          birthdateDecision,
          fieldDecisions,
          registrationId,
        ) => {
          setBusy(true);
          setMessage("");
          try {
            await confirmParentSurveyMatch({
              data: {
                responseId,
                studentId,
                fillMissingBirthDate,
                acknowledgeConflicts,
                reviewEvidenceKey,
                birthdateDecision,
                fieldDecisions,
                registrationId,
              },
            });
            setAttempt((value) => value + 1);
            await router.invalidate();
            setMessage(
              birthdateDecision === "use-survey" ||
                Object.values(fieldDecisions ?? {}).includes("use-survey")
                ? "Student match confirmed. Field decisions saved."
                : "Student match confirmed.",
            );
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
      {data.registrationEvidence.map((registration) => (
        <div key={registration.id} className="rounded border p-3 text-sm">
          <strong>Roster registration</strong>
          <p>
            {registration.sourceSchedule || "Schedule not recorded"} ·{" "}
            {registration.discipline} · {registration.level}
          </p>
          <p>
            Survey: {data.answers.session} · {data.answers.discipline} ·{" "}
            {data.answers.level}
          </p>
        </div>
      ))}
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
      </dl>
      <section
        className="space-y-3 rounded-lg border p-3"
        aria-label="Survey note review"
      >
        <h3 className="font-medium">Notes for lesson staff</h3>
        <p className="text-muted-foreground text-sm">
          Keep useful notes, or hide duplicates and empty answers from lesson
          staff. Original responses remain here, and hidden notes can be
          restored.
        </p>
        {(["medical", "placement"] as const).map((kind) => {
          const text =
            kind === "medical"
              ? data.answers.medicalConcerns
              : data.answers.additionalInformation;
          if (!text.trim()) return null;
          const status = data.noteReview[kind];
          return (
            <article key={kind} className="space-y-2 rounded border p-3">
              <strong>
                {kind === "medical" ? "Medical/support" : "Placement"}
              </strong>
              <p className="whitespace-pre-wrap">{text}</p>
              <p className="text-sm">
                {status === "dismissed"
                  ? "Hidden from lesson staff"
                  : !meaningfulSurveyNote(text)
                    ? "Empty answer · automatically omitted"
                    : status === "reviewed"
                      ? "Reviewed · visible to lesson staff"
                      : "Needs review"}
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    status === "dismissed" ? "pending" : "dismissed",
                    "reviewed",
                  ] as const
                ).map((next) => (
                  <Button
                    key={next}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setMessage("");
                      try {
                        await reviewSurveyNote({
                          data: { responseId, kind, status: next },
                        });
                        setAttempt((value) => value + 1);
                        await router.invalidate();
                        setMessage("Note decision saved.");
                      } catch (reviewError) {
                        setMessage(
                          reviewError instanceof Error
                            ? reviewError.message
                            : "Could not save note review.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {next === "dismissed"
                      ? "Hide note"
                      : next === "pending"
                        ? "Restore note"
                        : "Keep · mark reviewed"}
                  </Button>
                ))}
              </div>
            </article>
          );
        })}
      </section>
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
