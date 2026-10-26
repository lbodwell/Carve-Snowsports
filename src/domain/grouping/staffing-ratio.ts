export const RECOMMENDED_STUDENTS_PER_INSTRUCTOR = 4;

/** Advisory only: group size never prevents a placement or publication. */
export function staffingGuidance(
  studentCount: number,
  instructorIds: ReadonlyArray<string>,
  leadInstructorId?: string | null,
) {
  const instructors = new Set([
    ...instructorIds,
    ...(leadInstructorId ? [leadInstructorId] : []),
  ]).size;
  const recommendedInstructors = Math.ceil(
    studentCount / RECOMMENDED_STUDENTS_PER_INSTRUCTOR,
  );
  const aboveRatio =
    instructors > 0 &&
    studentCount > instructors * RECOMMENDED_STUDENTS_PER_INSTRUCTOR;
  const message = !studentCount
    ? null
    : !instructors
      ? `Unstaffed · ${recommendedInstructors} instructor${recommendedInstructors === 1 ? "" : "s"} recommended for 4:1.`
      : aboveRatio
        ? `Group too big for assigned staffing (recommended 4:1) · ${studentCount} students / ${instructors} instructor${instructors === 1 ? "" : "s"}. ${recommendedInstructors} recommended; placements are still allowed.`
        : null;
  return { instructors, recommendedInstructors, aboveRatio, message };
}
