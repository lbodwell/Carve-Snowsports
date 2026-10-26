export type GroupingRegistration = {
  id: string;
  abilityRank: number;
  ageBand: string;
  discipline: string;
  available: boolean;
  mustSeparateFrom: ReadonlySet<string>;
  preferTogetherWith: ReadonlySet<string>;
};

export type GroupingInstructor = {
  id: string;
  disciplines: ReadonlySet<string>;
  available: boolean;
  capacity: number;
};

export type GroupingRules = {
  recommendedStudentsPerInstructor: number;
  minimumInstructorsPerGroup: number;
};

export type ProposedGroup = {
  id: string;
  discipline: string;
  ageBand: string;
  instructorId: string | null;
  abilityRank?: number;
  registrationIds: Array<string>;
  score: number;
  explanations: Array<string>;
};

export type UnplacedRegistration = {
  registrationId: string;
  reason: string;
};

export type GroupingResult = {
  groups: Array<ProposedGroup>;
  unplaced: Array<UnplacedRegistration>;
  engineVersion: "v4";
};

function groupKey(registration: GroupingRegistration) {
  return `${registration.discipline}:${registration.ageBand}`;
}

function candidateScore(
  group: ProposedGroup,
  registration: GroupingRegistration,
  registrations: ReadonlyMap<string, GroupingRegistration>,
) {
  const existingRanks = group.registrationIds.flatMap((id) => {
    const existing = registrations.get(id);
    return existing ? [existing.abilityRank] : [];
  });
  const averageRank =
    existingRanks.length === 0
      ? registration.abilityRank
      : existingRanks.reduce((sum, rank) => sum + rank, 0) /
        existingRanks.length;
  const abilityPenalty = Math.abs(averageRank - registration.abilityRank) * 10;
  const sizePenalty = Math.max(0, group.registrationIds.length + 1 - 1);
  return abilityPenalty + sizePenalty;
}

function hasSeparationConflict(
  group: ProposedGroup,
  registration: GroupingRegistration,
  registrations: ReadonlyMap<string, GroupingRegistration>,
) {
  return group.registrationIds.some((existingId) => {
    const existing = registrations.get(existingId);
    return (
      existing?.mustSeparateFrom.has(registration.id) ||
      registration.mustSeparateFrom.has(existingId)
    );
  });
}

export function generateGroupingDraft(
  registrations: ReadonlyArray<GroupingRegistration>,
  _instructors: ReadonlyArray<GroupingInstructor>,
  rules: GroupingRules,
): GroupingResult {
  if (
    !Number.isInteger(rules.recommendedStudentsPerInstructor) ||
    rules.recommendedStudentsPerInstructor < 1
  ) {
    throw new Error(
      "The recommended staffing ratio must be a positive integer.",
    );
  }
  const byId = new Map(
    registrations.map((registration) => [registration.id, registration]),
  );
  const groups: Array<ProposedGroup> = [];
  const unplaced: Array<UnplacedRegistration> = [];
  const sortedRegistrations = [...registrations].sort((left, right) => {
    const leftConstraintCount =
      left.mustSeparateFrom.size + Number(!left.available);
    const rightConstraintCount =
      right.mustSeparateFrom.size + Number(!right.available);
    return (
      rightConstraintCount - leftConstraintCount ||
      groupKey(left).localeCompare(groupKey(right)) ||
      left.abilityRank - right.abilityRank ||
      left.id.localeCompare(right.id)
    );
  });

  for (const registration of sortedRegistrations) {
    if (!registration.available) {
      unplaced.push({
        registrationId: registration.id,
        reason: "The student is unavailable for the program schedule.",
      });
      continue;
    }

    const compatibleGroups = groups
      .filter(
        (group) =>
          `${group.discipline}:${group.ageBand}` === groupKey(registration) &&
          group.abilityRank === registration.abilityRank &&
          !hasSeparationConflict(group, registration, byId),
      )
      .map((group) => ({
        group,
        score: candidateScore(group, registration, byId),
      }))
      .sort(
        (left, right) =>
          left.score - right.score ||
          left.group.id.localeCompare(right.group.id),
      );
    const candidate = compatibleGroups[0]?.group;
    if (candidate) {
      candidate.registrationIds.push(registration.id);
      candidate.score += compatibleGroups[0]?.score ?? 0;
      candidate.explanations.push(
        `Placed ${registration.id} with compatible age band and discipline.`,
      );
      continue;
    }

    groups.push({
      id: `draft-${groups.length + 1}`,
      discipline: registration.discipline,
      ageBand: registration.ageBand,
      instructorId: null,
      abilityRank: registration.abilityRank,
      registrationIds: [registration.id],
      score: 0,
      explanations: [
        `Created a ${registration.discipline} group for age band ${registration.ageBand}.`,
      ],
    });
  }

  return {
    groups: groups.map((group) => ({
      ...group,
      explanations: [
        ...group.explanations,
        `No lead instructor assigned. Recommended staffing: one instructor per ${rules.recommendedStudentsPerInstructor} students.`,
      ],
    })),
    unplaced,
    engineVersion: "v4",
  };
}
