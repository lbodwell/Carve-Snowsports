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
  maximumStudentsPerGroup: number;
  targetStudentsPerGroup: number;
  minimumInstructorsPerGroup: number;
};

export type ProposedGroup = {
  id: string;
  discipline: string;
  ageBand: string;
  instructorId: string | null;
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
  engineVersion: "v1";
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
  instructors: ReadonlyArray<GroupingInstructor>,
  rules: GroupingRules,
): GroupingResult {
  if (rules.maximumStudentsPerGroup < 1 || rules.targetStudentsPerGroup < 1) {
    throw new Error("Group capacity values must be positive.");
  }
  if (rules.minimumInstructorsPerGroup !== 1) {
    throw new Error(
      "Grouping engine v1 supports exactly one instructor per group.",
    );
  }

  const byId = new Map(
    registrations.map((registration) => [registration.id, registration]),
  );
  const eligibleInstructors = instructors
    .filter((instructor) => instructor.available)
    .sort((left, right) => left.id.localeCompare(right.id));
  const instructorGroupCounts = new Map<string, number>();
  const groups: Array<ProposedGroup> = [];
  const unplaced: Array<UnplacedRegistration> = [];
  const sortedRegistrations = [...registrations].sort((left, right) => {
    const leftConstraintCount =
      left.mustSeparateFrom.size + Number(!left.available);
    const rightConstraintCount =
      right.mustSeparateFrom.size + Number(!right.available);
    return (
      rightConstraintCount - leftConstraintCount ||
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
          group.registrationIds.length < rules.maximumStudentsPerGroup &&
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

    const instructor = eligibleInstructors.find(
      (item) =>
        item.disciplines.has(registration.discipline) &&
        (instructorGroupCounts.get(item.id) ?? 0) < item.capacity,
    );
    if (!instructor) {
      unplaced.push({
        registrationId: registration.id,
        reason:
          "No available qualified instructor can start a compatible group.",
      });
      continue;
    }

    instructorGroupCounts.set(
      instructor.id,
      (instructorGroupCounts.get(instructor.id) ?? 0) + 1,
    );
    groups.push({
      id: `draft-${groups.length + 1}`,
      discipline: registration.discipline,
      ageBand: registration.ageBand,
      instructorId: instructor.id,
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
        group.registrationIds.length < rules.targetStudentsPerGroup
          ? "Group is below the target size and needs coordinator review."
          : "Group meets the target size.",
      ],
    })),
    unplaced,
    engineVersion: "v1",
  };
}
