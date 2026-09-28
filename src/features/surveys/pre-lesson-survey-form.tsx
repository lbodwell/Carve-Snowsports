import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";

import type {
  PreLessonIntakeAnswers,
  SurveyDiscipline,
} from "@/domain/surveys/pre-lesson-intake";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  levelHelp,
  preLessonIntakeAnswersSchema,
  surveyLevels,
  surveyLifts,
  surveySessions,
} from "@/domain/surveys/pre-lesson-intake";
import { submitSurveyResponse } from "@/server/functions/surveys";

type PublicSurveyPreview = {
  slug: string;
  title: string;
  invited: boolean;
  invitationEmail: string | null;
};

const inputClassName =
  "border-input bg-background min-h-11 rounded-xl border px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-[#315925] focus-visible:ring-3 focus-visible:ring-[#315925]/15 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/10";

type SurveySession = (typeof surveySessions)[number]["key"];
type SurveyLevel = (typeof surveyLevels)[number]["key"];
type SurveyLift = (typeof surveyLifts)[number]["key"];
type SurveyFormValues = Omit<
  PreLessonIntakeAnswers,
  "discipline" | "session" | "level" | "lifts"
> & {
  discipline: SurveyDiscipline | "";
  session: SurveySession | "";
  level: SurveyLevel | "";
  lifts: Array<SurveyLift>;
};
type SurveyField = keyof SurveyFormValues;
type SurveyErrors = Partial<Record<SurveyField, string>>;

function initialAnswers(parentEmail = ""): SurveyFormValues {
  return {
    parentEmail,
    childFirstName: "",
    childLastName: "",
    childDateOfBirth: "",
    discipline: "",
    session: "",
    level: "",
    lifts: [],
    medicalConcerns: "",
    additionalInformation: "",
  };
}

function validationErrors(values: SurveyFormValues) {
  const result = preLessonIntakeAnswersSchema.safeParse(values);
  if (result.success) return {};

  const errors: SurveyErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as SurveyField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

function RequiredMark() {
  return (
    <span className="text-[#c77400]" aria-hidden="true">
      *
    </span>
  );
}

function ValidationMessage({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="text-destructive text-sm" id={id} role="alert">
      {message}
    </p>
  ) : null;
}

export function PreLessonSurveyForm({
  preview,
  token,
}: {
  preview: PublicSurveyPreview;
  token?: string;
}) {
  const [answers, setAnswers] = useState(() =>
    initialAnswers(preview.invitationEmail ?? ""),
  );
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SurveyErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function setAnswer<TKey extends keyof SurveyFormValues>(
    key: TKey,
    value: SurveyFormValues[TKey],
  ) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateField(field: SurveyField) {
    const nextError = validationErrors(answers)[field];
    setFieldErrors((current) => ({ ...current, [field]: nextError }));
  }

  function toggleLift(lift: SurveyLift) {
    setFieldErrors((current) => ({ ...current, lifts: undefined }));
    setAnswers((current) => {
      if (lift === "never") {
        return {
          ...current,
          lifts: current.lifts.includes("never") ? [] : ["never"],
        };
      }
      const withoutNever = current.lifts.filter((value) => value !== "never");
      return {
        ...current,
        lifts: withoutNever.includes(lift)
          ? withoutNever.filter((value) => value !== lift)
          : [...withoutNever, lift],
      };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = preLessonIntakeAnswersSchema.safeParse(answers);
    if (!result.success) {
      const errors = validationErrors(answers);
      setFieldErrors(errors);
      const firstField = result.error.issues[0]?.path[0];
      if (typeof firstField === "string") {
        document
          .querySelector<HTMLElement>(
            `[data-field="${firstField}"], [name="${firstField}"]`,
          )
          ?.focus();
      }
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitSurveyResponse({
        data: {
          slug: preview.slug,
          token,
          website,
          answers: result.data,
        },
      });
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We could not save this response. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="bg-background w-full max-w-2xl rounded-3xl border p-8 text-center shadow-xl shadow-black/5 sm:p-12">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-[#edf4e9]">
          <CheckCircle2 className="size-9 text-[#315925]" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Thank you
        </h1>
        <p className="text-muted-foreground mt-2">
          Your child&apos;s information has been sent to the Pleasant Mountain
          team.
        </p>
        {preview.invited ? (
          <Button
            className="mt-6 cursor-pointer border-[#315925]/25 text-[#244617] hover:bg-[#edf4e9]"
            type="button"
            variant="outline"
            onClick={() => {
              setAnswers(initialAnswers(preview.invitationEmail ?? ""));
              setWebsite("");
              setFieldErrors({});
              setSubmitted(false);
            }}
          >
            Submit another child
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <form className="w-full max-w-3xl" onSubmit={submit} noValidate>
      <header className="relative overflow-hidden rounded-3xl bg-[#244617] p-7 text-white shadow-xl shadow-[#244617]/10 sm:p-10">
        <span
          className="absolute inset-x-0 top-0 h-1.5 bg-[#d88a00]"
          aria-hidden="true"
        />
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#d88a00] text-sm font-bold text-white shadow-sm">
            PM
          </span>
          <span className="text-sm font-medium text-white/80">
            Pleasant Mountain
          </span>
        </div>
        <p className="mt-8 text-sm font-medium tracking-wide text-[#f0ad35] uppercase">
          Student information
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Help us prepare for their first lesson
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-white/80">
          A few details about your child will help our team keep them safe and
          place them with students at a similar skill level.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
          <span>About 3 minutes</span>
          <span>Fields marked * are required</span>
        </div>
        {preview.invitationEmail ? (
          <p className="mt-5 rounded-xl bg-white/10 px-3 py-2 text-sm">
            Personal survey link for {preview.invitationEmail}
          </p>
        ) : null}
      </header>

      <div className="mt-5 flex flex-col gap-5">
        <section className="bg-background rounded-3xl border p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#315925] text-sm font-semibold text-white">
              1
            </span>
            <div>
              <h2 className="text-xl font-semibold">Parent and student</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                We use these details to find the right student record.
              </p>
            </div>
          </div>

          <label className="flex flex-col gap-2 text-sm font-medium">
            <span>
              Your email address <RequiredMark />
            </span>
            <Input
              name="parentEmail"
              type="email"
              autoComplete="email"
              required
              readOnly={preview.invited}
              maxLength={320}
              aria-invalid={Boolean(fieldErrors.parentEmail)}
              aria-describedby={
                fieldErrors.parentEmail ? "parentEmail-error" : undefined
              }
              value={answers.parentEmail}
              onChange={(event) => setAnswer("parentEmail", event.target.value)}
              onBlur={() => validateField("parentEmail")}
            />
            <span className="text-muted-foreground font-normal">
              We use this only to help connect the response to the correct
              student. It does not verify your identity.
            </span>
            <ValidationMessage
              id="parentEmail-error"
              message={fieldErrors.parentEmail}
            />
          </label>

          <fieldset className="mt-6 grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Your child</legend>
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>
                Child&apos;s first name <RequiredMark />
              </span>
              <Input
                name="childFirstName"
                autoComplete="given-name"
                required
                maxLength={100}
                aria-invalid={Boolean(fieldErrors.childFirstName)}
                aria-describedby={
                  fieldErrors.childFirstName
                    ? "childFirstName-error"
                    : undefined
                }
                value={answers.childFirstName}
                onChange={(event) =>
                  setAnswer("childFirstName", event.target.value)
                }
                onBlur={() => validateField("childFirstName")}
              />
              <ValidationMessage
                id="childFirstName-error"
                message={fieldErrors.childFirstName}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span>
                Child&apos;s last name <RequiredMark />
              </span>
              <Input
                name="childLastName"
                autoComplete="family-name"
                required
                maxLength={100}
                aria-invalid={Boolean(fieldErrors.childLastName)}
                aria-describedby={
                  fieldErrors.childLastName ? "childLastName-error" : undefined
                }
                value={answers.childLastName}
                onChange={(event) =>
                  setAnswer("childLastName", event.target.value)
                }
                onBlur={() => validateField("childLastName")}
              />
              <ValidationMessage
                id="childLastName-error"
                message={fieldErrors.childLastName}
              />
            </label>
            <div className="flex flex-col gap-2 text-sm font-medium">
              <span>
                Birthdate <RequiredMark />
              </span>
              <DatePicker
                name="childDateOfBirth"
                value={answers.childDateOfBirth}
                onValueChange={(value) => setAnswer("childDateOfBirth", value)}
                onBlur={() => validateField("childDateOfBirth")}
                placeholder="Choose a birthdate"
                defaultMonth={new Date(new Date().getFullYear() - 10, 0, 1)}
                startMonth={new Date(new Date().getFullYear() - 100, 0, 1)}
                endMonth={new Date()}
                disabledDates={{ after: new Date() }}
                required
                aria-invalid={Boolean(fieldErrors.childDateOfBirth)}
                aria-describedby={
                  fieldErrors.childDateOfBirth
                    ? "childDateOfBirth-error"
                    : undefined
                }
                className={inputClassName}
              />
              <ValidationMessage
                id="childDateOfBirth-error"
                message={fieldErrors.childDateOfBirth}
              />
            </div>
          </fieldset>
        </section>

        <section className="bg-background rounded-3xl border p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#315925] text-sm font-semibold text-white">
              2
            </span>
            <div>
              <h2 className="text-xl font-semibold">Lesson details</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Confirm what they are registered for.
              </p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-semibold">
              Discipline <RequiredMark />
            </legend>
            <RadioGroup
              className="grid gap-3 sm:grid-cols-2"
              name="discipline"
              value={answers.discipline || undefined}
              onValueChange={(value) =>
                setAnswer("discipline", value as SurveyDiscipline)
              }
            >
              {(["ski", "snowboard"] as const).map((discipline) => (
                <label
                  className="hover:bg-muted/40 flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-medium transition has-data-[state=checked]:border-[#315925] has-data-[state=checked]:bg-[#edf4e9]"
                  key={discipline}
                >
                  <RadioGroupItem
                    className="cursor-pointer border-[#315925] text-[#315925] data-checked:bg-[#315925]"
                    data-field="discipline"
                    value={discipline}
                    onBlur={() => validateField("discipline")}
                  />
                  {discipline === "ski" ? "Skier" : "Snowboarder"}
                </label>
              ))}
            </RadioGroup>
            <ValidationMessage
              id="discipline-error"
              message={fieldErrors.discipline}
            />
          </fieldset>

          <label className="mt-6 flex flex-col gap-2 text-sm font-medium">
            <span>
              Registered session <RequiredMark />
            </span>
            <Select
              name="session"
              value={answers.session || undefined}
              onValueChange={(value) =>
                setAnswer("session", value as SurveySession)
              }
            >
              <SelectTrigger
                className={inputClassName}
                name="session"
                aria-invalid={Boolean(fieldErrors.session)}
                aria-describedby={
                  fieldErrors.session ? "session-error" : undefined
                }
                onBlur={() => validateField("session")}
              >
                <SelectValue placeholder="Select a session" />
              </SelectTrigger>
              <SelectContent>
                {surveySessions.map((session) => (
                  <SelectItem
                    className="cursor-pointer"
                    key={session.key}
                    value={session.key}
                  >
                    {session.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ValidationMessage
              id="session-error"
              message={fieldErrors.session}
            />
          </label>
        </section>

        <section className="bg-background rounded-3xl border p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#315925] text-sm font-semibold text-white">
              3
            </span>
            <div>
              <h2 className="text-xl font-semibold">Current ability</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Choose the description that best reflects what they can do
                today.
              </p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-semibold">
              Ability level <RequiredMark />
            </legend>
            {!answers.discipline ? (
              <p className="bg-muted text-muted-foreground rounded-xl p-3 text-sm">
                Choose skiing or snowboarding above to see the appropriate level
                descriptions.
              </p>
            ) : null}
            <RadioGroup
              className="grid gap-3"
              name="level"
              value={answers.level || undefined}
              disabled={!answers.discipline}
              onValueChange={(value) =>
                setAnswer("level", value as SurveyLevel)
              }
            >
              {surveyLevels.map((level) => (
                <label
                  className="hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50 has-data-[state=checked]:border-[#315925] has-data-[state=checked]:bg-[#edf4e9]"
                  key={level.key}
                >
                  <RadioGroupItem
                    className="mt-1 cursor-pointer border-[#315925] text-[#315925] disabled:cursor-not-allowed data-checked:bg-[#315925]"
                    data-field="level"
                    value={level.key}
                    onBlur={() => validateField("level")}
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {level.label}
                    </span>
                    {answers.discipline ? (
                      <span className="text-muted-foreground mt-1 block text-sm leading-relaxed">
                        {levelHelp[answers.discipline][level.key]}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </RadioGroup>
            <ValidationMessage id="level-error" message={fieldErrors.level} />
          </fieldset>
        </section>

        <section className="bg-background rounded-3xl border p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#315925] text-sm font-semibold text-white">
              4
            </span>
            <div>
              <h2 className="text-xl font-semibold">Lift experience</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Select every lift they are comfortable riding.
              </p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="font-semibold">
              Comfortable lifts <RequiredMark />
            </legend>
            <p className="bg-muted/70 text-muted-foreground rounded-xl p-3 text-sm">
              Children ages 6 and under will always ride with an employee.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {surveyLifts.map((lift) => (
                <label
                  className="hover:bg-muted/40 flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition has-data-[state=checked]:border-[#315925] has-data-[state=checked]:bg-[#edf4e9]"
                  key={lift.key}
                >
                  <Checkbox
                    className="mt-0.5 cursor-pointer border-[#315925] data-checked:bg-[#315925]"
                    name="lifts"
                    checked={answers.lifts.includes(lift.key)}
                    onCheckedChange={() => toggleLift(lift.key)}
                    onBlur={() => validateField("lifts")}
                  />
                  {lift.label}
                </label>
              ))}
            </div>
            <ValidationMessage id="lifts-error" message={fieldErrors.lifts} />
          </fieldset>
        </section>

        <section className="bg-background rounded-3xl border p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#315925] text-sm font-semibold text-white">
              5
            </span>
            <div>
              <h2 className="text-xl font-semibold">Good to know</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                These final questions are optional.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Food allergies or other medical concerns
              <Textarea
                className={inputClassName}
                name="medicalConcerns"
                rows={4}
                maxLength={4000}
                value={answers.medicalConcerns}
                onChange={(event) =>
                  setAnswer("medicalConcerns", event.target.value)
                }
              />
              <span className="text-muted-foreground font-normal">
                Include anything instructors should know to keep your child
                safe.
              </span>
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium">
              Anything else we should know before their first lesson?
              <Textarea
                className={inputClassName}
                name="additionalInformation"
                rows={4}
                maxLength={4000}
                value={answers.additionalInformation}
                onChange={(event) =>
                  setAnswer("additionalInformation", event.target.value)
                }
              />
            </label>
          </div>
        </section>

        {!preview.invited ? (
          <label className="sr-only" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>
        ) : null}

        {error ? (
          <div
            className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border p-4 text-sm"
            role="alert"
          >
            <p className="font-medium">We couldn&apos;t submit the survey.</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}
        <section className="bg-background rounded-3xl border p-6 shadow-sm sm:p-8">
          <Button
            className="h-12 w-full cursor-pointer rounded-xl bg-[#244617] text-base text-white hover:bg-[#315925] disabled:cursor-not-allowed"
            type="submit"
            size="lg"
            disabled={submitting}
          >
            {submitting ? "Sending…" : "Submit student information"}
          </Button>
          <p className="text-muted-foreground mt-3 text-center text-xs leading-relaxed">
            Your response is shared only with authorized Pleasant Mountain
            staff.
          </p>
        </section>
      </div>
    </form>
  );
}
