import { describe, expect, it } from "vitest";

import {
  projectGroupingRosterStudent,
  projectInstructorLessonStudent,
  projectStudentDetail,
  projectStudentRosterItem,
} from "@/application/policies/sensitive-field-projection";
import {
  adminActor,
  coordinatorActor,
  instructorActor,
} from "@/test/factories/actors";

const sensitiveStudent = {
  id: "00000000-0000-4000-8000-000000000100",
  firstName: "Taylor",
  lastName: "Student",
  dateOfBirth: "2015-03-01",
  registrationId: "00000000-0000-4000-8000-000000000101",
  registrationStatus: "active",
  disciplineId: null,
  abilityLevelId: null,
  disciplineLabel: "Ski",
  abilityLevelLabel: "Level 2",
  guardianName: "Jamie Student",
  guardianPhone: "555-0100",
  guardianEmail: "jamie@example.test",
  medicalInfo: "EpiPen required",
  notes: "Needs morning check-in",
};

describe("sensitive field projection", () => {
  it("returns full student roster fields for coordinators", () => {
    expect(
      projectStudentRosterItem(coordinatorActor, sensitiveStudent),
    ).toEqual(sensitiveStudent);
  });

  it("strips sensitive roster fields for instructors", () => {
    expect(projectStudentRosterItem(instructorActor, sensitiveStudent)).toEqual(
      {
        ...sensitiveStudent,
        guardianName: "",
        guardianPhone: "",
        guardianEmail: "",
        medicalInfo: "",
        notes: "",
      },
    );
  });

  it("strips sensitive detail fields for instructors", () => {
    expect(projectStudentDetail(instructorActor, sensitiveStudent)).toEqual({
      ...sensitiveStudent,
      guardianName: "",
      guardianPhone: "",
      guardianEmail: "",
      medicalInfo: "",
      notes: "",
    });
  });

  it("keeps operational grouping fields for coordinators", () => {
    expect(
      projectGroupingRosterStudent(coordinatorActor, {
        registrationId: "00000000-0000-4000-8000-000000000101",
        studentId: sensitiveStudent.id,
        firstName: sensitiveStudent.firstName,
        lastName: sensitiveStudent.lastName,
        dateOfBirth: sensitiveStudent.dateOfBirth,
        disciplineId: null,
        abilityLevelId: null,
      }),
    ).toMatchObject({
      dateOfBirth: "2015-03-01",
      registrationId: "00000000-0000-4000-8000-000000000101",
    });
  });

  it("removes date of birth from grouping roster for instructors", () => {
    expect(
      projectGroupingRosterStudent(instructorActor, {
        registrationId: "00000000-0000-4000-8000-000000000101",
        studentId: sensitiveStudent.id,
        firstName: sensitiveStudent.firstName,
        lastName: sensitiveStudent.lastName,
        dateOfBirth: sensitiveStudent.dateOfBirth,
        disciplineId: null,
        abilityLevelId: null,
      }),
    ).toEqual({
      registrationId: "00000000-0000-4000-8000-000000000101",
      firstName: "Taylor",
      lastName: "Student",
      dateOfBirth: null,
      disciplineId: null,
      abilityLevelId: null,
    });
  });

  it("projects instructor lesson context without unrestricted profile data", () => {
    expect(
      projectInstructorLessonStudent({
        id: sensitiveStudent.id,
        firstName: sensitiveStudent.firstName,
        lastName: sensitiveStudent.lastName,
        disciplineLabel: sensitiveStudent.disciplineLabel,
        abilityLevelLabel: sensitiveStudent.abilityLevelLabel,
        medicalInfo: sensitiveStudent.medicalInfo,
        guardianPhone: sensitiveStudent.guardianPhone,
      }),
    ).toEqual({
      id: sensitiveStudent.id,
      firstName: "Taylor",
      lastName: "Student",
      disciplineLabel: "Ski",
      abilityLevelLabel: "Level 2",
      hasSupportReview: true,
      emergencyPhone: "555-0100",
    });
  });

  it("allows admins to retain full roster access", () => {
    expect(projectStudentRosterItem(adminActor, sensitiveStudent)).toEqual(
      sensitiveStudent,
    );
  });
});
