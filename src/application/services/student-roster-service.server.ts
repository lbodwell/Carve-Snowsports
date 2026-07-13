import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import {
  abilityLevels,
  auditEvents,
  contactMethods,
  disciplines,
  organizations,
  people,
  programs,
  registrations,
  seasons,
  studentGuardians,
  students,
  supportRecords,
} from "@/db/schema";

const studentProfileFields = {
  disciplineId: z.uuid().nullable().optional(),
  abilityLevelId: z.uuid().nullable().optional(),
  guardianName: z.string().trim().max(200).default(""),
  guardianPhone: z.string().trim().max(100).default(""),
  guardianEmail: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Enter a valid guardian email.",
    })
    .default(""),
  medicalInfo: z.string().trim().max(2000).default(""),
  notes: z.string().trim().max(5000).default(""),
} as const;

export const createStudentRegistrationSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  dateOfBirth: z.iso.date("Enter a valid date of birth."),
  ...studentProfileFields,
});

export type CreateStudentRegistrationInput = z.infer<
  typeof createStudentRegistrationSchema
>;

export const registerStudentSchema = z.object({
  studentId: z.uuid("Invalid student."),
});

export type RegisterStudentInput = z.infer<typeof registerStudentSchema>;

export const updateStudentSchema = z.object({
  studentId: z.uuid("Invalid student."),
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  dateOfBirth: z.iso.date("Enter a valid date of birth."),
  ...studentProfileFields,
});

export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const archiveStudentSchema = z.object({
  studentId: z.uuid("Invalid student."),
});

export type ArchiveStudentInput = z.infer<typeof archiveStudentSchema>;

async function assertPlacementConfiguration(
  actor: Actor,
  disciplineId?: string | null,
  abilityLevelId?: string | null,
) {
  if (disciplineId) {
    const [discipline] = await db
      .select({ id: disciplines.id })
      .from(disciplines)
      .innerJoin(programs, eq(disciplines.programId, programs.id))
      .innerJoin(seasons, eq(programs.seasonId, seasons.id))
      .where(
        and(
          eq(disciplines.id, disciplineId),
          eq(seasons.organizationId, actor.organizationId),
        ),
      );
    if (!discipline) {
      throw new ApplicationError(
        "VALIDATION",
        "The selected discipline is not available in this organization.",
      );
    }
  }
  if (abilityLevelId) {
    const [level] = await db
      .select({ id: abilityLevels.id })
      .from(abilityLevels)
      .innerJoin(programs, eq(abilityLevels.programId, programs.id))
      .innerJoin(seasons, eq(programs.seasonId, seasons.id))
      .where(
        and(
          eq(abilityLevels.id, abilityLevelId),
          eq(seasons.organizationId, actor.organizationId),
        ),
      );
    if (!level) {
      throw new ApplicationError(
        "VALIDATION",
        "The selected ability level is not available in this organization.",
      );
    }
  }
}

export async function createStudentRegistration(
  actor: Actor,
  input: CreateStudentRegistrationInput,
) {
  requirePermission(actor, "people:manage");
  const parsed = createStudentRegistrationSchema.parse(input);
  await assertPlacementConfiguration(
    actor,
    parsed.disciplineId,
    parsed.abilityLevelId,
  );

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId));

    if (!organization) {
      throw new ApplicationError("NOT_FOUND", "Organization not found.");
    }

    const [season] = await tx
      .select({ id: seasons.id })
      .from(seasons)
      .where(
        and(
          eq(seasons.organizationId, organization.id),
          isNull(seasons.archivedAt),
        ),
      );

    if (!season) {
      throw new ApplicationError(
        "INVALID_STATE",
        "This organization needs an active season before adding students.",
      );
    }

    const [program] = await tx
      .select({ id: programs.id, name: programs.name })
      .from(programs)
      .where(eq(programs.seasonId, season.id));

    if (!program) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The active season needs a program before adding students.",
      );
    }

    const [person] = await tx
      .insert(people)
      .values({
        organizationId: organization.id,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        dateOfBirth: parsed.dateOfBirth,
      })
      .returning();

    if (!person) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The student could not be created.",
      );
    }

    await tx
      .insert(students)
      .values({ personId: person.id, notes: parsed.notes });

    const [registration] = await tx
      .insert(registrations)
      .values({
        studentId: person.id,
        programId: program.id,
        disciplineId: parsed.disciplineId,
        abilityLevelId: parsed.abilityLevelId,
        status: "active",
      })
      .returning();

    if (!registration) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The student registration could not be created.",
      );
    }

    if (parsed.guardianName || parsed.guardianPhone || parsed.guardianEmail) {
      const nameParts = parsed.guardianName.split(/\s+/).filter(Boolean);
      const [guardian] = await tx
        .insert(people)
        .values({
          organizationId: organization.id,
          firstName: nameParts[0] ?? "Guardian",
          lastName: nameParts.slice(1).join(" ") || "Contact",
        })
        .returning({ id: people.id });
      if (guardian) {
        await tx.insert(studentGuardians).values({
          studentId: person.id,
          guardianId: guardian.id,
          relationship: "Guardian",
          isEmergencyContact: true,
        });
        const contacts = [
          parsed.guardianPhone
            ? {
                personId: guardian.id,
                kind: "phone",
                value: parsed.guardianPhone,
              }
            : null,
          parsed.guardianEmail
            ? {
                personId: guardian.id,
                kind: "email",
                value: parsed.guardianEmail,
              }
            : null,
        ].filter((value) => value !== null);
        if (contacts.length > 0) {
          await tx.insert(contactMethods).values(contacts);
        }
      }
    }
    if (parsed.medicalInfo) {
      await tx.insert(supportRecords).values({
        studentId: person.id,
        category: "special_condition",
        restrictedNote: parsed.medicalInfo,
        requiresReview: true,
      });
    }

    await tx.insert(auditEvents).values({
      organizationId: organization.id,
      actorId: actor.userId,
      entityType: "registration",
      entityId: registration.id,
      action: "roster.student_registered",
      metadata: {
        program: program.name,
        studentId: person.id,
      },
    });

    return { studentId: person.id, registrationId: registration.id };
  });
}

export async function registerStudent(
  actor: Actor,
  input: RegisterStudentInput,
) {
  requirePermission(actor, "people:manage");
  const parsed = registerStudentSchema.parse(input);

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId));
    if (!organization) {
      throw new ApplicationError("NOT_FOUND", "Organization not found.");
    }

    const [season] = await tx
      .select({ id: seasons.id })
      .from(seasons)
      .where(
        and(
          eq(seasons.organizationId, organization.id),
          isNull(seasons.archivedAt),
        ),
      );
    if (!season) {
      throw new ApplicationError(
        "INVALID_STATE",
        "This organization needs an active season before registering students.",
      );
    }

    const [program] = await tx
      .select({ id: programs.id, name: programs.name })
      .from(programs)
      .where(eq(programs.seasonId, season.id));
    if (!program) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The active season needs a program before registering students.",
      );
    }

    const [student] = await tx
      .select({ id: students.personId })
      .from(students)
      .innerJoin(people, eq(students.personId, people.id))
      .where(
        and(
          eq(students.personId, parsed.studentId),
          eq(people.organizationId, organization.id),
          isNull(people.archivedAt),
        ),
      );
    if (!student) {
      throw new ApplicationError("NOT_FOUND", "Student not found.");
    }

    const [existingRegistration] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.studentId, student.id),
          eq(registrations.programId, program.id),
          isNull(registrations.archivedAt),
        ),
      );
    if (existingRegistration) {
      return { created: false, registrationId: existingRegistration.id };
    }

    const [registration] = await tx
      .insert(registrations)
      .values({
        studentId: student.id,
        programId: program.id,
        status: "active",
      })
      .returning();
    if (!registration) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The student registration could not be created.",
      );
    }

    await tx.insert(auditEvents).values({
      organizationId: organization.id,
      actorId: actor.userId,
      entityType: "registration",
      entityId: registration.id,
      action: "roster.student_registered",
      metadata: { program: program.name, studentId: student.id },
    });

    return { created: true, registrationId: registration.id };
  });
}

export async function updateStudent(actor: Actor, input: UpdateStudentInput) {
  requirePermission(actor, "people:manage");
  const parsed = updateStudentSchema.parse(input);
  await assertPlacementConfiguration(
    actor,
    parsed.disciplineId,
    parsed.abilityLevelId,
  );

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId));
    if (!organization) {
      throw new ApplicationError("NOT_FOUND", "Organization not found.");
    }

    const [student] = await tx
      .select({ id: students.personId })
      .from(students)
      .innerJoin(people, eq(students.personId, people.id))
      .where(
        and(
          eq(students.personId, parsed.studentId),
          eq(people.organizationId, organization.id),
          isNull(people.archivedAt),
        ),
      );
    if (!student) {
      throw new ApplicationError("NOT_FOUND", "Student not found.");
    }

    const [updatedStudent] = await tx
      .update(people)
      .set({
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        dateOfBirth: parsed.dateOfBirth,
        updatedAt: new Date(),
      })
      .where(eq(people.id, student.id))
      .returning();
    if (!updatedStudent) {
      throw new ApplicationError(
        "INVALID_STATE",
        "The student could not be updated.",
      );
    }
    await tx
      .update(students)
      .set({ notes: parsed.notes, updatedAt: new Date() })
      .where(eq(students.personId, student.id));
    await tx
      .update(registrations)
      .set({
        disciplineId: parsed.disciplineId,
        abilityLevelId: parsed.abilityLevelId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(registrations.studentId, student.id),
          isNull(registrations.archivedAt),
        ),
      );

    const previousGuardians = await tx
      .select({ id: studentGuardians.guardianId })
      .from(studentGuardians)
      .where(eq(studentGuardians.studentId, student.id));
    await tx
      .delete(studentGuardians)
      .where(eq(studentGuardians.studentId, student.id));
    if (parsed.guardianName || parsed.guardianPhone || parsed.guardianEmail) {
      const nameParts = parsed.guardianName.split(/\s+/).filter(Boolean);
      const existingGuardianId = previousGuardians[0]?.id;
      const [guardian] = existingGuardianId
        ? await tx
            .update(people)
            .set({
              firstName: nameParts[0] ?? "Guardian",
              lastName: nameParts.slice(1).join(" ") || "Contact",
              updatedAt: new Date(),
            })
            .where(eq(people.id, existingGuardianId))
            .returning({ id: people.id })
        : await tx
            .insert(people)
            .values({
              organizationId: organization.id,
              firstName: nameParts[0] ?? "Guardian",
              lastName: nameParts.slice(1).join(" ") || "Contact",
            })
            .returning({ id: people.id });
      if (guardian) {
        await tx
          .delete(contactMethods)
          .where(eq(contactMethods.personId, guardian.id));
        await tx.insert(studentGuardians).values({
          studentId: student.id,
          guardianId: guardian.id,
          relationship: "Guardian",
          isEmergencyContact: true,
        });
        const contacts = [
          parsed.guardianPhone
            ? {
                personId: guardian.id,
                kind: "phone",
                value: parsed.guardianPhone,
              }
            : null,
          parsed.guardianEmail
            ? {
                personId: guardian.id,
                kind: "email",
                value: parsed.guardianEmail,
              }
            : null,
        ].filter((value) => value !== null);
        if (contacts.length > 0) {
          await tx.insert(contactMethods).values(contacts);
        }
      }
    }
    await tx
      .delete(supportRecords)
      .where(eq(supportRecords.studentId, student.id));
    if (parsed.medicalInfo) {
      await tx.insert(supportRecords).values({
        studentId: student.id,
        category: "special_condition",
        restrictedNote: parsed.medicalInfo,
        requiresReview: true,
      });
    }

    await tx.insert(auditEvents).values({
      organizationId: organization.id,
      actorId: actor.userId,
      entityType: "student",
      entityId: student.id,
      action: "roster.student_updated",
      metadata: {},
    });

    return updatedStudent;
  });
}

export async function archiveStudent(actor: Actor, input: ArchiveStudentInput) {
  requirePermission(actor, "people:manage");
  const parsed = archiveStudentSchema.parse(input);

  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId));
    if (!organization) {
      throw new ApplicationError("NOT_FOUND", "Organization not found.");
    }

    const [student] = await tx
      .select({ id: students.personId })
      .from(students)
      .innerJoin(people, eq(students.personId, people.id))
      .where(
        and(
          eq(students.personId, parsed.studentId),
          eq(people.organizationId, organization.id),
          isNull(people.archivedAt),
        ),
      );
    if (!student) {
      throw new ApplicationError("NOT_FOUND", "Student not found.");
    }

    const archivedAt = new Date();
    await tx
      .update(people)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(eq(people.id, student.id));
    await tx
      .update(registrations)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(
        and(
          eq(registrations.studentId, student.id),
          isNull(registrations.archivedAt),
        ),
      );

    await tx.insert(auditEvents).values({
      organizationId: organization.id,
      actorId: actor.userId,
      entityType: "student",
      entityId: student.id,
      action: "roster.student_archived",
      metadata: {},
    });
  });
}
