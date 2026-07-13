import type { Actor, Role } from "@/application/policies/authorization";

export type StudentSensitiveFields = {
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  medicalInfo: string;
  notes: string;
};

export type StudentRosterRecord = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  registrationId: string | null;
  registrationStatus: string | null;
  disciplineId: string | null;
  abilityLevelId: string | null;
  disciplineLabel: string | null;
  abilityLevelLabel: string | null;
} & StudentSensitiveFields;

export type StudentDetailRecord = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  registrationId: string | null;
  registrationStatus: string | null;
  disciplineId: string | null;
  abilityLevelId: string | null;
} & StudentSensitiveFields;

export type GroupingRosterRecord = {
  registrationId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  disciplineId: string | null;
  abilityLevelId: string | null;
};

export type ProjectedGroupingRosterRecord = Omit<
  GroupingRosterRecord,
  "studentId"
> & {
  studentId?: string;
};

export type InstructorLessonStudentRecord = {
  id: string;
  firstName: string;
  lastName: string;
  disciplineLabel: string | null;
  abilityLevelLabel: string | null;
  hasSupportReview: boolean;
  emergencyPhone: string | null;
};

const emptySensitiveFields: StudentSensitiveFields = {
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
  medicalInfo: "",
  notes: "",
};

export function canViewFullStudentProfile(role: Role) {
  return role === "admin" || role === "coordinator";
}

export function canViewStudentOperationalNotes(role: Role) {
  return role === "admin" || role === "coordinator";
}

export function canViewGuardianContact(role: Role) {
  return role === "admin" || role === "coordinator";
}

function sensitiveFieldsForActor(actor: Pick<Actor, "role">) {
  if (canViewFullStudentProfile(actor.role)) {
    return null;
  }

  return emptySensitiveFields;
}

export function projectStudentRosterItem<T extends StudentRosterRecord>(
  actor: Pick<Actor, "role">,
  student: T,
) {
  const hiddenFields = sensitiveFieldsForActor(actor);
  if (!hiddenFields) return student;

  return {
    ...student,
    ...hiddenFields,
  };
}

export function projectStudentDetail<T extends StudentDetailRecord>(
  actor: Pick<Actor, "role">,
  student: T,
) {
  const hiddenFields = sensitiveFieldsForActor(actor);
  if (!hiddenFields) return student;

  return {
    ...student,
    ...hiddenFields,
  };
}

export function projectGroupingRosterStudent<T extends GroupingRosterRecord>(
  actor: Pick<Actor, "role">,
  student: T,
): ProjectedGroupingRosterRecord {
  if (canViewFullStudentProfile(actor.role)) {
    const { studentId: _studentId, ...rosterStudent } = student;
    return rosterStudent;
  }

  return {
    registrationId: student.registrationId,
    firstName: student.firstName,
    lastName: student.lastName,
    dateOfBirth: null,
    disciplineId: student.disciplineId,
    abilityLevelId: student.abilityLevelId,
  };
}

export function projectInstructorLessonStudent(input: {
  id: string;
  firstName: string;
  lastName: string;
  disciplineLabel: string | null;
  abilityLevelLabel: string | null;
  medicalInfo: string;
  guardianPhone: string;
}): InstructorLessonStudentRecord {
  return {
    id: input.id,
    firstName: input.firstName,
    lastName: input.lastName,
    disciplineLabel: input.disciplineLabel,
    abilityLevelLabel: input.abilityLevelLabel,
    hasSupportReview: input.medicalInfo.trim() !== "",
    emergencyPhone:
      input.guardianPhone.trim() === "" ? null : input.guardianPhone,
  };
}
