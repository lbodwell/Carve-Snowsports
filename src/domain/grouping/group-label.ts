export function groupSuffix(ordinal: number) {
  let value = Math.max(1, ordinal);
  let label = "";
  while (value > 0) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function descriptiveGroupLabel(input: {
  discipline?: string | null;
  ageBand?: string | null;
  level?: string | null;
  instructor?: string | null;
  ordinal: number;
  duplicate?: boolean;
  duplicateInstructor?: boolean;
  context?: string;
}) {
  const title = [
    input.context,
    input.discipline ?? "Discipline needed",
    input.ageBand ?? "Age band needed",
    input.level ?? "Level needed",
  ]
    .filter(Boolean)
    .join(" · ");
  if (!input.duplicate) return title;
  return `${title} · ${input.instructor || groupSuffix(input.ordinal)}${input.instructor && input.duplicateInstructor ? ` · ${groupSuffix(input.ordinal)}` : ""}`;
}
