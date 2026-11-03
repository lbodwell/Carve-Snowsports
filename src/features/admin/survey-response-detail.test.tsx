// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SurveyResponseDetail } from "./survey-response-detail";
import { getParentSurveyResponseDetail } from "@/server/functions/surveys";
import { reviewSurveyNote } from "@/server/functions/student-roster";

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/server/functions/surveys", () => ({
  getParentSurveyResponseDetail: vi.fn(),
  confirmParentSurveyMatch: vi.fn(),
}));
vi.mock("@/server/functions/student-roster", () => ({
  reviewSurveyNote: vi.fn().mockResolvedValue({}),
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
    noteReview: {},
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
      medicalConcerns: "Carries an inhaler",
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
  vi.mocked(getParentSurveyResponseDetail).mockResolvedValue({
    ...value,
    noteReview: { medical: "dismissed" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Hide note" }),
  );
  await screen.findByText("Hidden from lesson staff");
  expect(reviewSurveyNote).toHaveBeenLastCalledWith({
    data: { responseId: "response", kind: "medical", status: "dismissed" },
  });
  vi.mocked(getParentSurveyResponseDetail).mockResolvedValue(value);
  fireEvent.click(
    screen.getByRole("button", { name: "Restore note" }),
  );
  await screen.findByText("Needs review");
  expect(reviewSurveyNote).toHaveBeenLastCalledWith({
    data: { responseId: "response", kind: "medical", status: "pending" },
  });
});
