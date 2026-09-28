import { z } from "zod";

import type { SurveyDefinition } from "@/domain/surveys/survey-definition";

export const disciplines = ["ski", "snowboard"] as const;
export type SurveyDiscipline = (typeof disciplines)[number];

export const surveySessions = [
  { key: "thursday-am-0930-1100", label: "Thursday AM (9:30–11)" },
  { key: "friday-am-0930-1100", label: "Friday AM (9:30–11)" },
  { key: "saturday-am-1000-1200", label: "Saturday AM (10–12)" },
  { key: "saturday-pm-1300-1500", label: "Saturday PM (1–3)" },
  { key: "saturday-full-1000-1500", label: "Saturday Full (10–3)" },
  {
    key: "saturday-am-0900-1200-advanced",
    label: "Saturday AM (9–12) — age 11+ and level 5 or 6",
  },
  { key: "sunday-am-1000-1200", label: "Sunday AM (10–12)" },
  { key: "sunday-pm-1300-1500", label: "Sunday PM (1–3)" },
  { key: "sunday-full-1000-1500", label: "Sunday Full (10–3)" },
  {
    key: "sunday-am-0900-1200-advanced",
    label: "Sunday AM (9–12) — age 11+ and level 5 or 6",
  },
] as const;

export const surveyLevels = [
  { key: "level-1", label: "Level 1 — First Timer" },
  { key: "level-2", label: "Level 2 — Learning to Stop" },
  { key: "level-3", label: "Level 3 — Learning to Turn" },
  { key: "level-4", label: "Level 4 — Comfortable on Green" },
  { key: "level-5", label: "Level 5 — Comfortable on Blue" },
  { key: "level-6", label: "Level 6 — Comfortable on Black" },
] as const;

export const levelHelp: Record<
  SurveyDiscipline,
  Record<(typeof surveyLevels)[number]["key"], string>
> = {
  ski: {
    "level-1": "Learn to walk, climb, turn, and stop.",
    "level-2":
      "Can walk, climb, turn, and stop; learning to control speed and direction.",
    "level-3":
      "Can control speed and direction; learning to control speed with skidded turns.",
    "level-4":
      "Can control speed with skidded turns; learning varied turn shapes using a narrow wedge or parallel position.",
    "level-5":
      "Can vary turn shapes in a narrow wedge or parallel position; learning parallel skiing with pole usage.",
    "level-6":
      "Can ski parallel with poles; learning long and short turns, bumps, and all-terrain skiing.",
  },
  snowboard: {
    "level-1": "Learn to skate, climb, sideslip, and traverse.",
    "level-2":
      "Can skate, climb, sideslip, and traverse; learning toe- and heel-side turns.",
    "level-3":
      "Can make toe- and heel-side turns; learning linked skidded turns to control speed.",
    "level-4":
      "Can control speed through linked toe- and heel-side skidded turns; learning flexion and extension.",
    "level-5":
      "Can vary turn shape and control speed; learning to carve toe and heel and ride switch.",
    "level-6":
      "Can carve toe and heel and ride switch; learning varied turns, park and pipe elements, and all-terrain riding.",
  },
};

export const surveyLifts = [
  { key: "never", label: "Has never been on a lift before" },
  { key: "surface", label: "Surface lift" },
  { key: "rabbit-run-triple", label: "Rabbit Run Triple" },
  { key: "pine-quad", label: "Pine Quad" },
  { key: "summit-express-quad", label: "Summit Express Quad" },
  { key: "sunnyside-triple-east", label: "Sunnyside Triple (East)" },
] as const;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid birthdate.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid birthdate.");

export const preLessonIntakeAnswersSchema = z
  .object({
    parentEmail: z.email("Enter a valid email address.").trim().toLowerCase(),
    childFirstName: z
      .string()
      .trim()
      .min(1, "Enter your child's first name.")
      .max(100),
    childLastName: z
      .string()
      .trim()
      .min(1, "Enter your child's last name.")
      .max(100),
    childDateOfBirth: dateSchema,
    discipline: z.enum(disciplines, {
      error: "Choose skiing or snowboarding.",
    }),
    session: z.enum(
      surveySessions.map((session) => session.key),
      {
        error: "Choose the session your child is registered for.",
      },
    ),
    level: z.enum(
      surveyLevels.map((level) => level.key),
      {
        error: "Choose your child's current ability level.",
      },
    ),
    lifts: z
      .array(z.enum(surveyLifts.map((lift) => lift.key)))
      .min(1, "Select at least one lift option."),
    medicalConcerns: z.string().trim().max(4000).default(""),
    additionalInformation: z.string().trim().max(4000).default(""),
  })
  .superRefine((answers, context) => {
    if (answers.lifts.includes("never") && answers.lifts.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["lifts"],
        message:
          "Choose either never ridden a lift or the lifts they can ride.",
      });
    }
  });

export type PreLessonIntakeAnswers = z.infer<
  typeof preLessonIntakeAnswersSchema
>;

export const preLessonIntakeDefinition: SurveyDefinition<PreLessonIntakeAnswers> =
  {
    key: "pre_lesson_intake",
    version: 1,
    title: "Pre-lesson student information",
    validate: (input) => preLessonIntakeAnswersSchema.parse(input),
  };
