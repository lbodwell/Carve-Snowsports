import { z } from "zod";

export type LifecycleGroup = {
  id: string;
  disciplineId: string | null;
  ageBandId: string | null;
  abilityLevelId: string | null;
  weekday: number;
  timeSlotId: string;
  leadInstructorId: string | null;
  instructorIds: Array<string>;
  notes: string | null;
  registrationIds: Array<string>;
  displayOrdinal: number;
  parentGroupId?: string;
  description?: string;
  closed?: boolean;
};
export const groupChangeActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("closure"),
    groupId: z.uuid(),
    closed: z.boolean(),
  }),
  z.object({
    type: z.literal("move"),
    registrationId: z.uuid(),
    fromGroupId: z.uuid(),
    toGroupId: z.uuid(),
  }),
  z.object({
    type: z.literal("staff"),
    groupId: z.uuid(),
    leadInstructorId: z.uuid().nullable(),
    instructorIds: z.array(z.uuid()),
  }),
  z.object({
    type: z.literal("details"),
    groupId: z.uuid(),
    disciplineId: z.uuid(),
    ageBandId: z.uuid().nullable(),
    abilityLevelId: z.uuid().nullable(),
    weekday: z.number().int().min(0).max(6),
    timeSlotId: z.uuid(),
    notes: z.string().max(5000),
  }),
  z.object({
    type: z.literal("split"),
    groupId: z.uuid(),
    newGroupId: z.uuid(),
    registrationIds: z.array(z.uuid()).min(1),
    leadInstructorId: z.uuid().nullable().optional(),
    instructorIds: z.array(z.uuid()).optional(),
  }),
]);
export type GroupChangeAction = z.infer<typeof groupChangeActionSchema>;
export type DatedGroupChange = {
  id: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  action: GroupChangeAction;
};

export function applyGroupChange(
  input: Array<LifecycleGroup>,
  action: GroupChangeAction,
) {
  const groups = structuredClone(input);
  const find = (id: string) => {
    const group = groups.find((item) => item.id === id);
    if (!group) throw new Error("The referenced group no longer exists.");
    return group;
  };
  if (action.type === "closure") {
    const group = find(action.groupId);
    if (action.closed && group.registrationIds.length)
      throw new Error("Move all students before closing this group.");
    group.closed = action.closed;
    if (action.closed) {
      group.instructorIds = [];
      group.leadInstructorId = null;
    }
  } else if (action.type === "move") {
    const source = find(action.fromGroupId),
      destination = find(action.toGroupId);
    if (
      source.closed ||
      destination.closed ||
      source.id === destination.id ||
      !source.registrationIds.includes(action.registrationId)
    )
      throw new Error("The student's source placement changed.");
    source.registrationIds = source.registrationIds.filter(
      (id) => id !== action.registrationId,
    );
    if (destination.registrationIds.includes(action.registrationId))
      throw new Error("Student is already placed in the destination.");
    destination.registrationIds.push(action.registrationId);
  } else if (action.type === "staff") {
    const group = find(action.groupId);
    if (group.closed)
      throw new Error("Reopen this group before assigning instructors.");
    if (
      action.leadInstructorId &&
      !action.instructorIds.includes(action.leadInstructorId)
    )
      throw new Error("Lead instructor must be assigned to the group.");
    group.leadInstructorId = action.leadInstructorId;
    group.instructorIds = [...new Set(action.instructorIds)];
  } else if (action.type === "details") {
    Object.assign(find(action.groupId), {
      disciplineId: action.disciplineId,
      ageBandId: action.ageBandId,
      abilityLevelId: action.abilityLevelId,
      weekday: action.weekday,
      timeSlotId: action.timeSlotId,
      notes: action.notes,
    });
  } else {
    const source = find(action.groupId);
    const ids = [...new Set(action.registrationIds)];
    if (
      groups.some((group) => group.id === action.newGroupId) ||
      ids.length >= source.registrationIds.length ||
      ids.some((id) => !source.registrationIds.includes(id))
    )
      throw new Error(
        "A split must move some, but not all, source members into a new group.",
      );
    source.registrationIds = source.registrationIds.filter(
      (id) => !ids.includes(id),
    );
    groups.push({
      ...source,
      id: action.newGroupId,
      parentGroupId: source.id,
      registrationIds: ids,
      instructorIds: action.instructorIds ?? [],
      leadInstructorId: action.leadInstructorId ?? null,
      notes: null,
      displayOrdinal:
        Math.max(...groups.map((group) => group.displayOrdinal)) + 1,
    });
  }
  return groups;
}

/** Input changes are ordered by approval sequence. Expired exceptions simply
 * stop applying; the underlying ongoing placement remains intact. */
export function groupsAsOf(
  base: Array<LifecycleGroup>,
  changes: Array<DatedGroupChange>,
  date: string,
) {
  return changes.reduce(
    (groups, change) =>
      change.effectiveFrom <= date &&
      (!change.effectiveUntil || change.effectiveUntil >= date)
        ? applyGroupChange(groups, change.action)
        : groups,
    structuredClone(base),
  );
}

export function nextDate(date: string, delta = 1) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

export function lifecycleBoundaries(
  changes: Array<DatedGroupChange>,
  startsOn: string,
  endsOn: string,
) {
  return [
    ...new Set([
      startsOn,
      ...changes.flatMap((change) => [
        change.effectiveFrom,
        ...(change.effectiveUntil ? [nextDate(change.effectiveUntil)] : []),
      ]),
    ]),
  ]
    .filter((date) => date >= startsOn && date <= endsOn)
    .sort();
}
