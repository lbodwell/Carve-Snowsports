export type ReviewChoice = "keep-roster" | "use-survey";
export type SurveyFieldDecisions = Partial<
  Record<
    "firstName" | "lastName" | "discipline" | "level" | "session",
    ReviewChoice
  >
>;
