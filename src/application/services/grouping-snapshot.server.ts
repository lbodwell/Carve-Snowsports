import type {
  GroupingInstructor,
  GroupingRegistration,
  GroupingRules,
} from "@/domain/grouping/engine";
import type { SessionCalendar } from "@/domain/calendar/session-calendar";
import { computeAgeOnDate } from "@/domain/calendar/student-age";

export const GROUPING_RULE_SET_VERSION = 2;

export const DEFAULT_GROUPING_RULES: GroupingRules = {
  maximumStudentsPerGroup: 6,
  targetStudentsPerGroup: 4,
  minimumInstructorsPerGroup: 1,
};

export const DEFAULT_DRAFT_WEEKDAY = 6;

export function ageBandEngineKey(minimumAge: number, maximumAge: number) {
  return `${minimumAge}-${maximumAge}`;
}

export function resolveAgeBandForBirthDate(
  dateOfBirth: string | null,
  seasonStartsOn: string,
  ageBands: ReadonlyArray<{
    id: string;
    minimumAge: number;
    maximumAge: number;
  }>,
) {
  if (!dateOfBirth) return null;
  const age = computeAgeOnDate(dateOfBirth, seasonStartsOn);
  const match = ageBands.find(
    (band) => age >= band.minimumAge && age <= band.maximumAge,
  );
  if (!match) return null;
  return {
    id: match.id,
    engineKey: ageBandEngineKey(match.minimumAge, match.maximumAge),
  };
}

export type GroupingProgramSnapshot = {
  seasonStartsOn: string;
  defaultTimeSlotId: string;
  timeSlots?: ReadonlyArray<SessionCalendar & { id: string }>;
  disciplines: ReadonlyArray<{ id: string; key: string }>;
  ageBands: ReadonlyArray<{
    id: string;
    minimumAge: number;
    maximumAge: number;
  }>;
  abilityLevels: ReadonlyArray<{ id: string; numericRank: number }>;
  registrations: ReadonlyArray<{
    id: string;
    studentId?: string;
    disciplineId: string | null;
    disciplineKey: string | null;
    abilityLevelId: string | null;
    abilityRank: number;
    dateOfBirth: string | null;
    ageBandId: string | null;
    ageBandEngineKey: string | null;
    schedule?: { weekday: number; timeSlotId: string } | null;
    needsSchedule?: boolean;
  }>;
  instructors: ReadonlyArray<{
    id: string;
    disciplineKeys: ReadonlySet<string>;
  }>;
};

export function buildEngineInput(snapshot: GroupingProgramSnapshot): {
  registrations: Array<GroupingRegistration>;
  instructors: Array<GroupingInstructor>;
  rules: GroupingRules;
} {
  const registrations = snapshot.registrations.map((registration) => ({
    id: registration.id,
    abilityRank: registration.abilityRank,
    ageBand: registration.ageBandEngineKey ?? "unknown",
    discipline: registration.disciplineKey ?? "unknown",
    available: Boolean(
      registration.disciplineKey && registration.ageBandEngineKey,
    ),
    mustSeparateFrom: new Set<string>(),
    preferTogetherWith: new Set<string>(),
  }));

  const instructors = snapshot.instructors.map((instructor) => ({
    id: instructor.id,
    disciplines: instructor.disciplineKeys,
    available: instructor.disciplineKeys.size > 0,
    capacity: 1,
  }));

  return {
    registrations,
    instructors,
    rules: DEFAULT_GROUPING_RULES,
  };
}
