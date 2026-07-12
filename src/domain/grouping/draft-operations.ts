export type DraftAssignment = {
  registrationId: string;
  groupId: string;
  overrideReason?: string;
};

export type DraftState = {
  id: string;
  version: number;
  assignments: Array<DraftAssignment>;
};

export type MoveRegistrationCommand = {
  type: "move_registration";
  commandId: string;
  baseVersion: number;
  registrationId: string;
  groupId: string;
  overrideReason?: string;
};

export type DraftOperationResult = {
  state: DraftState;
  inverse: MoveRegistrationCommand | null;
};

export function applyMoveRegistration(
  state: DraftState,
  command: MoveRegistrationCommand,
): DraftOperationResult {
  if (state.version !== command.baseVersion) {
    throw new Error(`VERSION_CONFLICT:${state.version}`);
  }

  const existing = state.assignments.find(
    (assignment) => assignment.registrationId === command.registrationId,
  );
  const assignments = state.assignments.filter(
    (assignment) => assignment.registrationId !== command.registrationId,
  );
  assignments.push({
    registrationId: command.registrationId,
    groupId: command.groupId,
    overrideReason: command.overrideReason,
  });

  const nextState = {
    ...state,
    version: state.version + 1,
    assignments: assignments.sort((left, right) =>
      left.registrationId.localeCompare(right.registrationId),
    ),
  };

  return {
    state: nextState,
    inverse: existing
      ? {
          type: "move_registration",
          commandId: crypto.randomUUID(),
          baseVersion: nextState.version,
          registrationId: existing.registrationId,
          groupId: existing.groupId,
          overrideReason: existing.overrideReason,
        }
      : null,
  };
}
