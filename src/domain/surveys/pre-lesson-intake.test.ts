import { describe, expect, test } from "vitest";

import type { StudentMatchCandidate } from "@/domain/surveys/survey-definition";
import { preLessonIntakeAnswersSchema } from "@/domain/surveys/pre-lesson-intake";
import { matchSurveyStudent } from "@/domain/surveys/student-matching";

const validAnswers = {
  parentEmail: "parent@example.com",
  childFirstName: "Avery",
  childLastName: "Chen",
  childDateOfBirth: "2017-01-08",
  discipline: "ski",
  session: "saturday-am-1000-1200",
  level: "level-3",
  lifts: ["surface"],
  medicalConcerns: "",
  additionalInformation: "",
} as const;

const candidates: Array<StudentMatchCandidate> = [
  {
    studentId: "student-1",
    firstName: "Avery",
    lastName: "Chen",
    dateOfBirth: "2017-01-08",
    guardianEmails: ["parent@example.com"],
  },
];

describe("pre-lesson intake survey", () => {
  test("accepts a complete response", () => {
    expect(preLessonIntakeAnswersSchema.parse(validAnswers)).toMatchObject(
      validAnswers,
    );
  });

  test("rejects a missing lift response", () => {
    const result = preLessonIntakeAnswersSchema.safeParse({
      ...validAnswers,
      lifts: [],
    });
    expect(result.success).toBe(false);
  });

  test("requires a valid parent email address", () => {
    const result = preLessonIntakeAnswersSchema.safeParse({
      ...validAnswers,
      parentEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  test("does not combine never ridden with named lifts", () => {
    const result = preLessonIntakeAnswersSchema.safeParse({
      ...validAnswers,
      lifts: ["never", "surface"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects levels outside one through six", () => {
    const result = preLessonIntakeAnswersSchema.safeParse({
      ...validAnswers,
      level: "level-7",
    });
    expect(result.success).toBe(false);
  });
});

describe("survey student matching", () => {
  test("finds an exact name and birthdate match", () => {
    expect(
      matchSurveyStudent(
        {
          firstName: "  ÁVERY ",
          lastName: "chen",
          dateOfBirth: "2017-01-08",
        },
        candidates,
      ),
    ).toEqual({ status: "unique", suggestedStudentId: "student-1" });
  });

  test("does not use a name-only match", () => {
    expect(
      matchSurveyStudent(
        {
          firstName: "Avery",
          lastName: "Chen",
          dateOfBirth: "2017-01-09",
        },
        candidates,
      ),
    ).toEqual({ status: "unmatched", suggestedStudentId: null });
  });

  test("uses the invitation email to disambiguate", () => {
    const duplicate = {
      ...candidates[0]!,
      studentId: "student-2",
      guardianEmails: ["other@example.com"],
    };
    expect(
      matchSurveyStudent(
        {
          firstName: "Avery",
          lastName: "Chen",
          dateOfBirth: "2017-01-08",
          invitationEmail: "parent@example.com",
        },
        [...candidates, duplicate],
      ),
    ).toEqual({ status: "unique", suggestedStudentId: "student-1" });
  });

  test("reports duplicate exact matches as ambiguous", () => {
    const duplicate = {
      ...candidates[0]!,
      studentId: "student-2",
      guardianEmails: [],
    };
    expect(
      matchSurveyStudent(
        {
          firstName: "Avery",
          lastName: "Chen",
          dateOfBirth: "2017-01-08",
        },
        [...candidates, duplicate],
      ),
    ).toEqual({ status: "ambiguous", suggestedStudentId: null });
  });
});
