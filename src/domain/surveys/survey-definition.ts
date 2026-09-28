export type SurveyDefinitionKey = "pre_lesson_intake";

export type SurveyDefinition<TAnswers> = {
  key: SurveyDefinitionKey;
  version: number;
  title: string;
  validate: (input: unknown) => TAnswers;
};

export type StudentMatchCandidate = {
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  guardianEmails: Array<string>;
};

export type StudentMatchResult =
  | { status: "unique"; suggestedStudentId: string }
  | { status: "ambiguous"; suggestedStudentId: null }
  | { status: "unmatched"; suggestedStudentId: null };
