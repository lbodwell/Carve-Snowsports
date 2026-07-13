import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { projectInstructorLessonStudent } from "@/application/policies/sensitive-field-projection";
import { db } from "@/db/client.server";
import {
  abilityLevels,
  contactMethods,
  disciplines,
  groupRevisionMemberships,
  groupRevisions,
  instructors,
  lessonInstances,
  people,
  programs,
  registrations,
  seasonGroups,
  seasons,
  studentGuardians,
  supportRecords,
  timeSlots,
} from "@/db/schema";

export const getLessonInstanceRosterSchema = z.object({
  lessonInstanceId: z.uuid(),
});

async function resolveInstructorPersonId(actor: Actor) {
  requirePermission(actor, "lesson:operate");
  if (actor.role !== "instructor") {
    throw new ApplicationError(
      "FORBIDDEN",
      "Only instructors can access lesson schedules.",
    );
  }

  const [instructor] = await db
    .select({ personId: instructors.personId })
    .from(instructors)
    .innerJoin(people, eq(instructors.personId, people.id))
    .where(
      and(
        eq(instructors.userId, actor.userId),
        eq(people.organizationId, actor.organizationId),
        isNull(people.archivedAt),
      ),
    );
  if (!instructor) {
    throw new ApplicationError(
      "NOT_FOUND",
      "No instructor profile is linked to your account.",
    );
  }
  return instructor.personId;
}

async function assertInstructorLessonAccess(
  actor: Actor,
  instructorPersonId: string,
  lessonInstanceId: string,
) {
  const [lesson] = await db
    .select({
      id: lessonInstances.id,
      lessonDate: lessonInstances.lessonDate,
      timeSlotId: lessonInstances.timeSlotId,
      timeSlotLabel: timeSlots.label,
      groupNumber: seasonGroups.groupNumber,
      programName: programs.name,
      seasonName: seasons.name,
      groupRevisionId: lessonInstances.groupRevisionId,
    })
    .from(lessonInstances)
    .innerJoin(timeSlots, eq(lessonInstances.timeSlotId, timeSlots.id))
    .innerJoin(groupRevisions, eq(lessonInstances.groupRevisionId, groupRevisions.id))
    .innerJoin(seasonGroups, eq(groupRevisions.seasonGroupId, seasonGroups.id))
    .innerJoin(programs, eq(seasonGroups.programId, programs.id))
    .innerJoin(seasons, eq(seasonGroups.seasonId, seasons.id))
    .where(
      and(
        eq(lessonInstances.id, lessonInstanceId),
        eq(groupRevisions.leadInstructorId, instructorPersonId),
        eq(seasonGroups.organizationId, actor.organizationId),
      ),
    );
  if (!lesson) {
    throw new ApplicationError("NOT_FOUND", "Lesson not found.");
  }
  return lesson;
}

export async function getInstructorLessonSchedule(actor: Actor) {
  const instructorPersonId = await resolveInstructorPersonId(actor);

  const lessons = await db
    .select({
      id: lessonInstances.id,
      lessonDate: lessonInstances.lessonDate,
      status: lessonInstances.status,
      timeSlotLabel: timeSlots.label,
      groupNumber: seasonGroups.groupNumber,
      programName: programs.name,
      seasonName: seasons.name,
    })
    .from(lessonInstances)
    .innerJoin(timeSlots, eq(lessonInstances.timeSlotId, timeSlots.id))
    .innerJoin(groupRevisions, eq(lessonInstances.groupRevisionId, groupRevisions.id))
    .innerJoin(seasonGroups, eq(groupRevisions.seasonGroupId, seasonGroups.id))
    .innerJoin(programs, eq(seasonGroups.programId, programs.id))
    .innerJoin(seasons, eq(seasonGroups.seasonId, seasons.id))
    .where(
      and(
        eq(groupRevisions.leadInstructorId, instructorPersonId),
        eq(seasonGroups.organizationId, actor.organizationId),
      ),
    )
    .orderBy(asc(lessonInstances.lessonDate), asc(timeSlots.displayOrder));

  return { lessons };
}

export async function getLessonInstanceRoster(
  actor: Actor,
  input: z.infer<typeof getLessonInstanceRosterSchema>,
) {
  const parsed = getLessonInstanceRosterSchema.parse(input);
  const instructorPersonId = await resolveInstructorPersonId(actor);
  const lesson = await assertInstructorLessonAccess(
    actor,
    instructorPersonId,
    parsed.lessonInstanceId,
  );

  const memberships = await db
    .select({
      studentId: groupRevisionMemberships.studentId,
      registrationId: groupRevisionMemberships.registrationId,
      firstName: people.firstName,
      lastName: people.lastName,
      disciplineLabel: disciplines.label,
      abilityLevelLabel: abilityLevels.label,
    })
    .from(groupRevisionMemberships)
    .innerJoin(people, eq(groupRevisionMemberships.studentId, people.id))
    .innerJoin(
      registrations,
      eq(groupRevisionMemberships.registrationId, registrations.id),
    )
    .leftJoin(disciplines, eq(registrations.disciplineId, disciplines.id))
    .leftJoin(
      abilityLevels,
      eq(registrations.abilityLevelId, abilityLevels.id),
    )
    .where(
      and(
        eq(groupRevisionMemberships.groupRevisionId, lesson.groupRevisionId),
        lte(groupRevisionMemberships.effectiveFrom, lesson.lessonDate),
        or(
          isNull(groupRevisionMemberships.effectiveUntil),
          gte(groupRevisionMemberships.effectiveUntil, lesson.lessonDate),
        ),
      ),
    )
    .orderBy(asc(people.lastName), asc(people.firstName));

  const studentIds = memberships.map((row) => row.studentId);
  const [supportRows, guardianPhones] =
    studentIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              studentId: supportRecords.studentId,
              note: supportRecords.restrictedNote,
            })
            .from(supportRecords)
            .where(
              and(
                inArray(supportRecords.studentId, studentIds),
                eq(supportRecords.active, true),
              ),
            ),
          db
            .select({
              studentId: studentGuardians.studentId,
              phone: contactMethods.value,
            })
            .from(studentGuardians)
            .innerJoin(people, eq(studentGuardians.guardianId, people.id))
            .innerJoin(
              contactMethods,
              and(
                eq(contactMethods.personId, people.id),
                eq(contactMethods.kind, "phone"),
                eq(contactMethods.isPrimary, true),
              ),
            )
            .where(
              and(
                inArray(studentGuardians.studentId, studentIds),
                eq(studentGuardians.isEmergencyContact, true),
              ),
            ),
        ]);

  const medicalByStudent = new Map(
    supportRows.map((row) => [row.studentId, row.note ?? ""] as const),
  );
  const phoneByStudent = new Map(
    guardianPhones.map((row) => [row.studentId, row.phone] as const),
  );

  return {
    lesson: {
      id: lesson.id,
      lessonDate: lesson.lessonDate,
      timeSlotLabel: lesson.timeSlotLabel,
      groupNumber: lesson.groupNumber,
      programName: lesson.programName,
      seasonName: lesson.seasonName,
    },
    roster: memberships.map((student) =>
      projectInstructorLessonStudent({
        id: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        disciplineLabel: student.disciplineLabel,
        abilityLevelLabel: student.abilityLevelLabel,
        medicalInfo: medicalByStudent.get(student.studentId) ?? "",
        guardianPhone: phoneByStudent.get(student.studentId) ?? "",
      }),
    ),
  };
}
