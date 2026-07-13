import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { Actor } from "@/application/policies/authorization";
import { requirePermission } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import { auditEvents, people, users } from "@/db/schema";

export const studentAuditHistorySchema = z.object({
  studentId: z.uuid(),
});

export const instructorAuditHistorySchema = z.object({
  instructorId: z.uuid(),
});

export const rosterAuditSearchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  entityType: z
    .enum(["all", "student", "instructor", "registration"])
    .optional()
    .default("all"),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

const rosterEntityTypes = ["student", "instructor", "registration"] as const;

export type AuditHistoryEntry = {
  id: string;
  action: string;
  summary: string;
  actorLabel: string;
  createdAt: string;
};

export type RosterAuditHistoryEntry = AuditHistoryEntry & {
  entityType: string;
  entityId: string;
  subjectLabel: string;
  subjectHref: string | null;
};

const actionLabels: Record<string, string> = {
  "roster.student_registered": "Student registered",
  "roster.student_updated": "Student updated",
  "roster.student_archived": "Student archived",
  "roster.instructor_created": "Instructor created",
  "roster.instructor_updated": "Instructor updated",
  "roster.instructor_archived": "Instructor archived",
};

function formatActorLabel(actor: {
  actorName: string | null;
  actorEmail: string | null;
}) {
  if (actor.actorName?.trim()) return actor.actorName;
  if (actor.actorEmail?.trim()) return actor.actorEmail;
  return "System";
}

export function summarizeAuditEvent(input: {
  action: string;
  metadata: Record<string, unknown>;
}) {
  const label = actionLabels[input.action] ?? input.action;

  if (
    input.action === "roster.student_registered" &&
    typeof input.metadata.program === "string"
  ) {
    return `${label} for ${input.metadata.program}`;
  }

  if (input.action === "roster.instructor_created") {
    const disciplineKeys = input.metadata.disciplineKeys;
    if (Array.isArray(disciplineKeys) && disciplineKeys.length > 0) {
      return `${label} (${disciplineKeys.join(", ")})`;
    }
  }

  if (input.action === "roster.instructor_updated") {
    const disciplineKeys = input.metadata.disciplineKeys;
    if (Array.isArray(disciplineKeys) && disciplineKeys.length > 0) {
      return `${label}; disciplines: ${disciplineKeys.join(", ")}`;
    }
  }

  return label;
}

async function listAuditEvents(
  actor: Actor,
  filter:
    | { kind: "student"; studentId: string }
    | { kind: "instructor"; instructorId: string },
) {
  requirePermission(actor, "people:manage");

  const entityFilter =
    filter.kind === "student"
      ? or(
          and(
            eq(auditEvents.entityType, "student"),
            eq(auditEvents.entityId, filter.studentId),
          ),
          sql`${auditEvents.metadata} ->> 'studentId' = ${filter.studentId}`,
        )
      : and(
          eq(auditEvents.entityType, "instructor"),
          eq(auditEvents.entityId, filter.instructorId),
        );

  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id))
    .where(
      and(eq(auditEvents.organizationId, actor.organizationId), entityFilter),
    )
    .orderBy(desc(auditEvents.createdAt));

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    summary: summarizeAuditEvent({
      action: row.action,
      metadata: row.metadata,
    }),
    actorLabel: formatActorLabel(row),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listStudentAuditHistory(
  actor: Actor,
  input: z.infer<typeof studentAuditHistorySchema>,
) {
  const parsed = studentAuditHistorySchema.parse(input);
  return listAuditEvents(actor, {
    kind: "student",
    studentId: parsed.studentId,
  });
}

export async function listInstructorAuditHistory(
  actor: Actor,
  input: z.infer<typeof instructorAuditHistorySchema>,
) {
  const parsed = instructorAuditHistorySchema.parse(input);
  return listAuditEvents(actor, {
    kind: "instructor",
    instructorId: parsed.instructorId,
  });
}

const studentPerson = alias(people, "student_person");
const instructorPerson = alias(people, "instructor_person");
const registrationStudent = alias(people, "registration_student");

function formatPersonName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

function resolveSubject(row: {
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  studentFirstName: string | null;
  studentLastName: string | null;
  instructorFirstName: string | null;
  instructorLastName: string | null;
  registrationStudentFirstName: string | null;
  registrationStudentLastName: string | null;
}) {
  if (row.entityType === "student") {
    const label = formatPersonName(row.studentFirstName, row.studentLastName);
    return {
      subjectLabel: label ?? "Student",
      subjectHref: `/admin/students/${row.entityId}`,
    };
  }

  if (row.entityType === "instructor") {
    const label = formatPersonName(
      row.instructorFirstName,
      row.instructorLastName,
    );
    return {
      subjectLabel: label ?? "Instructor",
      subjectHref: null,
    };
  }

  const studentId =
    typeof row.metadata.studentId === "string" ? row.metadata.studentId : null;
  const label = formatPersonName(
    row.registrationStudentFirstName,
    row.registrationStudentLastName,
  );
  return {
    subjectLabel: label ?? "Registration",
    subjectHref: studentId ? `/admin/students/${studentId}` : null,
  };
}

export async function searchRosterAuditHistory(
  actor: Actor,
  input: z.input<typeof rosterAuditSearchSchema>,
) {
  requirePermission(actor, "people:manage");
  const parsed = rosterAuditSearchSchema.parse(input);

  const entityFilter =
    parsed.entityType === "all"
      ? inArray(auditEvents.entityType, [...rosterEntityTypes])
      : eq(auditEvents.entityType, parsed.entityType);

  const filters = [
    eq(auditEvents.organizationId, actor.organizationId),
    entityFilter,
  ];

  if (parsed.query) {
    const term = `%${parsed.query}%`;
    filters.push(
      or(
        ilike(auditEvents.action, term),
        ilike(users.name, term),
        ilike(users.email, term),
        ilike(studentPerson.firstName, term),
        ilike(studentPerson.lastName, term),
        ilike(instructorPerson.firstName, term),
        ilike(instructorPerson.lastName, term),
        ilike(registrationStudent.firstName, term),
        ilike(registrationStudent.lastName, term),
      )!,
    );
  }

  const rows = await db
    .select({
      id: auditEvents.id,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      action: auditEvents.action,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actorName: users.name,
      actorEmail: users.email,
      studentFirstName: studentPerson.firstName,
      studentLastName: studentPerson.lastName,
      instructorFirstName: instructorPerson.firstName,
      instructorLastName: instructorPerson.lastName,
      registrationStudentFirstName: registrationStudent.firstName,
      registrationStudentLastName: registrationStudent.lastName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id))
    .leftJoin(
      studentPerson,
      and(
        eq(auditEvents.entityType, "student"),
        eq(studentPerson.id, auditEvents.entityId),
      ),
    )
    .leftJoin(
      instructorPerson,
      and(
        eq(auditEvents.entityType, "instructor"),
        eq(instructorPerson.id, auditEvents.entityId),
      ),
    )
    .leftJoin(
      registrationStudent,
      and(
        eq(auditEvents.entityType, "registration"),
        eq(
          registrationStudent.id,
          sql`(${auditEvents.metadata} ->> 'studentId')::uuid`,
        ),
      ),
    )
    .where(and(...filters))
    .orderBy(desc(auditEvents.createdAt))
    .limit(parsed.limit);

  return rows.map((row) => {
    const subject = resolveSubject(row);
    return {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      summary: summarizeAuditEvent({
        action: row.action,
        metadata: row.metadata,
      }),
      actorLabel: formatActorLabel(row),
      createdAt: row.createdAt.toISOString(),
      subjectLabel: subject.subjectLabel,
      subjectHref: subject.subjectHref,
    } satisfies RosterAuditHistoryEntry;
  });
}
