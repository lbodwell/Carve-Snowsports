import { describe, expect, it } from "vitest";
import {
  assessSurveyResponse,
  registrationSurveyStatus,
} from "./response-assessment";
import type { SurveyAssessmentContext } from "./response-assessment";

const response = {
  childFirstName: "Avery",
  childLastName: "Chen",
  childDateOfBirth: "2014-01-08",
  answers: {
    discipline: "ski",
    level: "level-5",
    session: "saturday-am-0900-1200-advanced",
  },
};
function context(): SurveyAssessmentContext {
  return {
    students: [
      {
        studentId: "child",
        firstName: "Avery",
        lastName: "Chen",
        dateOfBirth: null,
        guardianEmails: [],
      },
    ],
    registrations: [
      {
        id: "registration",
        studentId: "child",
        programId: "program",
        disciplineId: "ski",
        abilityLevelId: "level-5",
        sourceSnapshot: { weekday: "Saturday", session: "9am" },
      },
    ],
    slots: [
      {
        id: "advanced",
        programId: "program",
        label: "Ages 11–13",
        startsAt: "09:00",
        endsAt: "12:00",
        cohort: "season",
        allowedWeekdays: [6, 0],
      },
    ],
    disciplines: [{ id: "ski", key: "ski", programId: "program" }],
    levels: [
      { id: "level-5", key: "level-5", programId: "program" },
      { id: "level-6", key: "level-6", programId: "program" },
    ],
  };
}
describe("survey identity and enrollment assessment", () => {
  it("allows a missing birthdate when the registered session and ability agree", () => {
    expect(assessSurveyResponse(response, context())).toMatchObject({
      canAutoConfirm: true,
      studentId: "child",
      unresolvedIssues: [],
      candidateRegistrationIds: ["registration"],
    });
  });
  it("requires review for conflicting birthdates and levels without losing the candidate", () => {
    const data = context();
    data.students[0]!.dateOfBirth = "2015-01-08";
    data.registrations[0]!.abilityLevelId = "level-6";
    const result = assessSurveyResponse(response, data);
    expect(result.canAutoConfirm).toBe(false);
    expect(result.studentId).toBe("child");
    expect(result.unresolvedIssues.join(" ")).toContain("Birthdates differ");
    expect(result.unresolvedIssues.join(" ")).toContain("Level conflicts");
  });
  it("keeps missing, ambiguous and wrong-session enrollments in review", () => {
    const data = context();
    data.registrations.push({ ...data.registrations[0]!, id: "duplicate" });
    expect(assessSurveyResponse(response, data).canAutoConfirm).toBe(false);
    data.registrations = [];
    expect(assessSurveyResponse(response, data).canAutoConfirm).toBe(false);
    const wrong = assessSurveyResponse(
      {
        ...response,
        answers: {
          ...response.answers,
          session: "sunday-am-0900-1200-advanced",
        },
      },
      context(),
    );
    expect(wrong.canAutoConfirm).toBe(false);
    expect(wrong.candidateRegistrationIds).toEqual(["registration"]);
  });
  it("matches weekday cohort identity at the configured 9:30–11 time", () => {
    const data = context();
    data.registrations[0]!.sourceSnapshot = {
      weekday: "Thursday",
      session: "Session 2",
    };
    data.slots[0] = {
      ...data.slots[0]!,
      startsAt: "09:30",
      endsAt: "11:00",
      cohort: "session-2",
      allowedWeekdays: [4, 5],
    };
    expect(
      assessSurveyResponse(
        {
          ...response,
          answers: {
            ...response.answers,
            session: "thursday-am-0930-1100-session-2",
          },
        },
        data,
      ).canAutoConfirm,
    ).toBe(true);
    expect(
      assessSurveyResponse(
        {
          ...response,
          answers: {
            ...response.answers,
            session: "thursday-am-0930-1100-session-1",
          },
        },
        data,
      ).canAutoConfirm,
    ).toBe(false);
  });
  it("preserves acknowledgements only for the same evidence and conflict values", () => {
    const data = context();
    data.registrations[0]!.abilityLevelId = "level-6";
    const first = assessSurveyResponse(response, data);
    const reviewed = {
      ...response,
      confirmedStudentId: "child",
      linkSource: "staff",
      reviewAcknowledgement: {
        studentId: "child",
        issues: first.issues,
        evidenceKey: first.evidenceKey,
        reviewedBy: "admin",
        reviewedAt: "2026-10-31",
      },
    };
    expect(assessSurveyResponse(reviewed, data).unresolvedIssues).toEqual([]);
    data.students[0]!.dateOfBirth = response.childDateOfBirth;
    expect(assessSurveyResponse(reviewed, data).unresolvedIssues).toEqual([]);
    data.students[0]!.dateOfBirth = "2015-01-08";
    expect(
      assessSurveyResponse(reviewed, data).unresolvedIssues.join(),
    ).toContain("Birthdates differ");
  });
  it("calculates survey status per registration and keeps unresolved evidence visible", () => {
    const rows = [
      {
        confirmedStudentId: "child",
        candidateRegistrationIds: ["one"],
        enrichmentIssues: [],
      },
    ];
    expect(registrationSurveyStatus("one", rows)).toBe("Completed");
    expect(registrationSurveyStatus("two", rows)).toBe("No response");
    expect(
      registrationSurveyStatus("one", [
        ...rows,
        {
          confirmedStudentId: null,
          candidateRegistrationIds: ["one"],
          enrichmentIssues: ["Conflict"],
        },
      ]),
    ).toBe("Needs review");
  });
});
