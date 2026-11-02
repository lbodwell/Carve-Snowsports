import { computeAgeOnDate } from "@/domain/calendar/student-age";

/** Compare live student values with the current placement, including published groups. */
export function placementReviewIssues(
  student: {
    registrationStatus: string;
    disciplineId: string | null;
    abilityLevelId: string | null;
    dateOfBirth: string | null;
    schedule: { weekday: number; timeSlotId: string } | null;
  },
  group: {
    disciplineId: string | null;
    abilityLevelId: string | null;
    weekday: number;
    timeSlotId: string;
    ageBandId: string | null;
  },
  ageBands: ReadonlyArray<{
    id: string;
    minimumAge: number;
    maximumAge: number;
  }>,
  seasonStartsOn: string,
) {
  const issues: Array<string> = [];
  if (student.registrationStatus !== "active")
    issues.push("Registration is no longer active");
  if (!student.disciplineId) issues.push("Discipline missing");
  else if (student.disciplineId !== group.disciplineId)
    issues.push("Discipline differs from group");
  if (!student.abilityLevelId) issues.push("Level missing");
  else if (
    group.abilityLevelId &&
    student.abilityLevelId !== group.abilityLevelId
  )
    issues.push("Level differs from group");
  if (!student.schedule) issues.push("Session needs confirmation");
  else if (
    student.schedule.weekday !== group.weekday ||
    student.schedule.timeSlotId !== group.timeSlotId
  )
    issues.push("Session differs from group");
  const band = ageBands.find((item) => item.id === group.ageBandId);
  if (!student.dateOfBirth) issues.push("Birthdate missing");
  else if (band) {
    const age = computeAgeOnDate(student.dateOfBirth, seasonStartsOn);
    if (age < band.minimumAge || age > band.maximumAge)
      issues.push("Age is outside the group’s age band");
  }
  return issues;
}
