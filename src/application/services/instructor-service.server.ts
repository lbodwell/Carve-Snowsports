import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import {
  auditEvents,
  contactMethods,
  disciplines,
  instructorQualifications,
  instructors,
  people,
  programs,
  seasons,
} from "@/db/schema";

const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    message: "Enter a valid email address.",
  });

export const instructorInputSchema = z
  .object({
    instructorId: z.uuid().optional(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(100),
    email: optionalEmail,
    notes: z.string().trim().max(5000),
    disciplineKeys: z
      .array(z.enum(["ski", "snowboard"]))
      .min(1, "Select at least one discipline."),
  })
  .refine((value) => value.phone !== "" || value.email !== "", {
    message: "Provide at least one phone number or email address.",
    path: ["email"],
  });

export const archiveInstructorSchema = z.object({
  instructorId: z.uuid(),
});

export type InstructorInput = z.infer<typeof instructorInputSchema>;

async function getProgramDisciplines(
  actor: Actor,
  disciplineKeys: Array<"ski" | "snowboard">,
) {
  const rows = await db
    .select({ id: disciplines.id, key: disciplines.key })
    .from(disciplines)
    .innerJoin(programs, eq(disciplines.programId, programs.id))
    .innerJoin(seasons, eq(programs.seasonId, seasons.id))
    .where(
      and(
        eq(seasons.organizationId, actor.organizationId),
        isNull(seasons.archivedAt),
        inArray(disciplines.key, disciplineKeys),
      ),
    );
  if (rows.length !== disciplineKeys.length) {
    throw new ApplicationError(
      "VALIDATION",
      "One or more disciplines are not configured for the active program.",
    );
  }
  return rows;
}

export async function listInstructors(actor: Actor) {
  requirePermission(actor, "people:manage");
  const roster = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      notes: instructors.notes,
    })
    .from(instructors)
    .innerJoin(people, eq(instructors.personId, people.id))
    .where(
      and(
        eq(people.organizationId, actor.organizationId),
        isNull(people.archivedAt),
      ),
    )
    .orderBy(asc(people.lastName), asc(people.firstName));

  if (roster.length === 0) return [];
  const ids = roster.map((row) => row.id);
  const [contacts, qualifications] = await Promise.all([
    db
      .select({
        personId: contactMethods.personId,
        kind: contactMethods.kind,
        value: contactMethods.value,
      })
      .from(contactMethods)
      .where(inArray(contactMethods.personId, ids)),
    db
      .select({
        instructorId: instructorQualifications.instructorId,
        key: disciplines.key,
        label: disciplines.label,
      })
      .from(instructorQualifications)
      .innerJoin(
        disciplines,
        eq(instructorQualifications.disciplineId, disciplines.id),
      )
      .where(inArray(instructorQualifications.instructorId, ids)),
  ]);

  return roster.map((row) => ({
    ...row,
    notes: row.notes ?? "",
    phone:
      contacts.find(
        (contact) => contact.personId === row.id && contact.kind === "phone",
      )?.value ?? "",
    email:
      contacts.find(
        (contact) => contact.personId === row.id && contact.kind === "email",
      )?.value ?? "",
    disciplines: qualifications
      .filter((qualification) => qualification.instructorId === row.id)
      .map(({ key, label }) => ({ key, label })),
  }));
}

export async function saveInstructor(actor: Actor, input: InstructorInput) {
  requirePermission(actor, "people:manage");
  const parsed = instructorInputSchema.parse(input);
  const configuredDisciplines = await getProgramDisciplines(
    actor,
    parsed.disciplineKeys,
  );

  return db.transaction(async (tx) => {
    let instructorId = parsed.instructorId;
    if (instructorId) {
      const [existing] = await tx
        .select({ id: people.id })
        .from(instructors)
        .innerJoin(people, eq(instructors.personId, people.id))
        .where(
          and(
            eq(people.id, instructorId),
            eq(people.organizationId, actor.organizationId),
            isNull(people.archivedAt),
          ),
        );
      if (!existing)
        throw new ApplicationError("NOT_FOUND", "Instructor not found.");
      await tx
        .update(people)
        .set({
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          updatedAt: new Date(),
        })
        .where(eq(people.id, instructorId));
      await tx
        .update(instructors)
        .set({ notes: parsed.notes, updatedAt: new Date() })
        .where(eq(instructors.personId, instructorId));
      await tx
        .delete(contactMethods)
        .where(eq(contactMethods.personId, instructorId));
      await tx
        .delete(instructorQualifications)
        .where(eq(instructorQualifications.instructorId, instructorId));
    } else {
      const [person] = await tx
        .insert(people)
        .values({
          organizationId: actor.organizationId,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
        })
        .returning({ id: people.id });
      if (!person)
        throw new ApplicationError(
          "INVALID_STATE",
          "Instructor could not be created.",
        );
      instructorId = person.id;
      await tx
        .insert(instructors)
        .values({ personId: instructorId, notes: parsed.notes });
    }

    const contacts = [
      parsed.phone
        ? { personId: instructorId, kind: "phone", value: parsed.phone }
        : null,
      parsed.email
        ? { personId: instructorId, kind: "email", value: parsed.email }
        : null,
    ].filter((value) => value !== null);
    if (contacts.length > 0) await tx.insert(contactMethods).values(contacts);
    await tx.insert(instructorQualifications).values(
      configuredDisciplines.map((discipline) => ({
        instructorId,
        disciplineId: discipline.id,
      })),
    );
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "instructor",
      entityId: instructorId,
      action: parsed.instructorId
        ? "roster.instructor_updated"
        : "roster.instructor_created",
      metadata: { disciplineKeys: parsed.disciplineKeys },
    });
    return { instructorId };
  });
}

export async function archiveInstructor(
  actor: Actor,
  input: z.infer<typeof archiveInstructorSchema>,
) {
  requirePermission(actor, "people:manage");
  const parsed = archiveInstructorSchema.parse(input);
  const [instructor] = await db
    .select({ id: people.id })
    .from(instructors)
    .innerJoin(people, eq(instructors.personId, people.id))
    .where(
      and(
        eq(people.id, parsed.instructorId),
        eq(people.organizationId, actor.organizationId),
        isNull(people.archivedAt),
      ),
    );
  if (!instructor)
    throw new ApplicationError("NOT_FOUND", "Instructor not found.");

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(people)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(people.id, instructor.id));
    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "instructor",
      entityId: instructor.id,
      action: "roster.instructor_archived",
      metadata: {},
    });
  });
}
