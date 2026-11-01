// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SurveyResponseDetail } from "./survey-response-detail";
import { getParentSurveyResponseDetail } from "@/server/functions/surveys";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/server/functions/surveys", () => ({
  getParentSurveyResponseDetail: vi.fn(),
  confirmParentSurveyMatch: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("reloads an already-open response when refreshed queue evidence changes", async () => {
  const value: Awaited<ReturnType<typeof getParentSurveyResponseDetail>> = {
    childFirstName: "Avery",
    childLastName: "Demo",
    childDateOfBirth: "2017-01-08",
    confirmedStudentId: "child",
    suggestedStudentId: "child",
    linkSource: "automatic",
    reviewAcknowledgement: null,
    enrichmentIssues: [] as Array<string>,
    students: [],
    registrationEvidence: [],
    answers: {
      parentEmail: "demo@example.test",
      childFirstName: "Avery",
      childLastName: "Demo",
      childDateOfBirth: "2017-01-08",
      discipline: "ski",
      session: "saturday-am-1000-1200",
      level: "level-3",
      lifts: ["never"],
      medicalConcerns: "",
      additionalInformation: "",
    },
  };
  vi.mocked(getParentSurveyResponseDetail).mockResolvedValue(value);
  const { rerender } = render(
    <SurveyResponseDetail responseId="response" reviewRevision="clean" />,
  );
  await screen.findByText("Linked student");
  expect(
    screen.queryByText("Level conflicts: roster level-3; survey level-4."),
  ).toBeNull();
  vi.mocked(getParentSurveyResponseDetail).mockResolvedValue({
    ...value,
    enrichmentIssues: ["Level conflicts: roster level-3; survey level-4."],
  });
  rerender(
    <SurveyResponseDetail responseId="response" reviewRevision="conflict" />,
  );
  await screen.findByText("Level conflicts: roster level-3; survey level-4.");
  await waitFor(() =>
    expect(getParentSurveyResponseDetail).toHaveBeenCalledTimes(2),
  );
});
