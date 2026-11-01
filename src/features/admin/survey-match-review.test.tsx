// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SurveyMatchReview } from "./survey-match-review";

afterEach(cleanup);
it("offers a survey birthdate override and requires a fresh acknowledgement when changing the choice", () => {
  const confirm = vi.fn();
  render(
    <SurveyMatchReview
      programs={[]}
      busy={false}
      onConfirm={confirm}
      students={[
        {
          studentId: "child",
          firstName: "Avery",
          lastName: "Demo",
          dateOfBirth: "2015-01-08",
          reviewEvidenceKey: "current-evidence",
        },
      ]}
      response={{
        childFirstName: "Avery",
        childLastName: "Demo",
        childDateOfBirth: "2014-01-08",
        confirmedStudentId: null,
        suggestedStudentId: "child",
        enrichmentIssues: ["Birthdates differ"],
      }}
    />,
  );
  const acknowledge = screen.getByRole("checkbox", { name: /I have reviewed/ });
  const button = screen.getByRole("button", { name: "Confirm student match" });
  expect(
    screen.getByRole<HTMLInputElement>("radio", { name: /Keep roster/ })
      .checked,
  ).toBe(true);
  fireEvent.click(acknowledge);
  fireEvent.click(screen.getByRole("radio", { name: /Use survey/ }));
  expect((acknowledge as HTMLInputElement).checked).toBe(false);
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(acknowledge);
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledWith(
    "child",
    false,
    undefined,
    true,
    "current-evidence",
    "use-survey",
  );
});
