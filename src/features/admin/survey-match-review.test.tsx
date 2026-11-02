// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SurveyMatchReview } from "./survey-match-review";

afterEach(cleanup);
it("offers independent name and enrollment decisions and resets them for another registration", () => {
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
          dateOfBirth: "2014-01-08",
          reviewEvidenceKey: "evidence",
          matchingRegistrationId: "first",
          registrations: [
            {
              id: "first",
              discipline: "ski",
              level: "level-3",
              schedule: "Thursday · Session 1",
            },
            {
              id: "second",
              discipline: "ski",
              level: "level-3",
              schedule: "Thursday · Session 2",
            },
          ],
        },
      ]}
      response={{
        childFirstName: "Avy",
        childLastName: "Demos",
        childDateOfBirth: "2014-01-08",
        confirmedStudentId: null,
        suggestedStudentId: "child",
        answers: {
          discipline: "snowboard",
          level: "level-4",
          session: "thursday-am-0930-1100-session-1",
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: /Use survey first name/ }));
  fireEvent.click(screen.getByRole("radio", { name: /Use survey level/ }));
  const acknowledge = screen.getByRole<HTMLInputElement>("checkbox");
  fireEvent.click(acknowledge);
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm student match" }),
  );
  expect(confirm).toHaveBeenLastCalledWith(
    "child",
    false,
    undefined,
    true,
    "evidence",
    "keep-roster",
    { firstName: "use-survey", level: "use-survey" },
    "first",
  );
  fireEvent.change(screen.getByLabelText("Registration to review"), {
    target: { value: "second" },
  });
  expect(acknowledge.checked).toBe(false);
  expect(
    screen.getByRole<HTMLInputElement>("radio", { name: /Keep roster level/ })
      .checked,
  ).toBe(true);
  expect(
    screen.getByRole("radio", { name: /Use survey session/ }),
  ).toBeTruthy();
});
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
    {},
    undefined,
  );
});
