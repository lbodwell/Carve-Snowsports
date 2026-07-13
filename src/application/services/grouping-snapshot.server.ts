import type {
  GroupingInstructor,
  GroupingRegistration,
  GroupingRules,
} from "@/domain/grouping/engine";

export const GROUPING_RULE_SET_VERSION = 1;

export const DEFAULT_GROUPING_RULES: GroupingRules = {
  maximumStudentsPerGroup: 6,
  targetStudentsPerGroup: 4,
  minimumInstructorsPerGroup: 1,
};

export const DEFAULT_DRAFT_WEEKDAY = 6;

export function ageBandEngineKey(minimumAge: number, maximumAge: number) {
  return `${minimumAge}-${maximumAge}`;
}

export function computeAgeOnDate(dateOfBirth: string, referenceDate: string) {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  if (
    reference.getUTCMonth() < birth.getUTCMonth() ||
    (reference.getUTCMonth() === birth.getUTCMonth() &&
      reference.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
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
  disciplines: ReadonlyArray<{ id: string; key: string }>;
  ageBands: ReadonlyArray<{
    id: string;
    minimumAge: number;
    maximumAge: number;
  }>;
  abilityLevels: ReadonlyArray<{ id: string; numericRank: number }>;
  registrations: ReadonlyArray<{
    id: string;
    disciplineId: string | null;
    disciplineKey: string | null;
    abilityLevelId: string | null;
    abilityRank: number;
    dateOfBirth: string | null;
    ageBandId: string | null;
    ageBandEngineKey: string | null;
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
    capacity: 4,
  }));

  return {
    registrations,
    instructors,
    rules: DEFAULT_GROUPING_RULES,
  };
}
