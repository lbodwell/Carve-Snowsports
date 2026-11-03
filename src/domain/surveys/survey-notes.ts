/** Only exact empty-answer placeholders are ignored; substantive concerns are retained. */
export function meaningfulSurveyNote(value: unknown): string {
  if (typeof value !== "string") return "";
  const note = value.trim();
  return /^(?:none|n\/?a|not applicable|no|nil|nothing|no concerns)[.!\s]*$/i.test(
    note,
  )
    ? ""
    : note;
}
