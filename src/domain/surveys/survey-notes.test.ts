import { describe, expect, it } from "vitest";
import { meaningfulSurveyNote } from "./survey-notes";

describe("survey note placeholders", () => {
  it.each([
    "None",
    "n/a",
    "NA.",
    "no",
    " Not applicable ",
    "no concerns.",
    "",
    null,
  ])("omits %s", (value) => {
    expect(meaningfulSurveyNote(value)).toBe("");
  });
  it.each([
    "No allergies, but asthma",
    "None currently; carries medication",
    "Needs breaks",
  ])("retains %s", (value) => {
    expect(meaningfulSurveyNote(value)).toBe(value);
  });
});
