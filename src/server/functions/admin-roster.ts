import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requirePermission } from "@/application/policies/authorization";
import {
  projectStudentDetail,
  projectStudentRosterItem,
} from "@/application/policies/sensitive-field-projection";
import { db } from "@/db/client.server";
import {
  abilityLevels,
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
import { resolveActor } from "@/server/auth/resolve-actor.server";

export const getAdminWorkspace = createServerFn({ method: "GET" }).handler(
  async () => {
    const actor = await resolveActor();
    requirePermission(actor, "people:manage");
    const [organization] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        timezone: organizations.timezone,
      })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId));

    if (!organization) {
      return {
        organization: null,
        season: null,
        program: null,
        students: [],
        disciplines: [],
        abilityLevels: [],
      };
    }

    const [season] = await db
      .select({
        id: seasons.id,
        name: seasons.name,
        startsOn: seasons.startsOn,
        endsOn: seasons.endsOn,
        status: seasons.status,
      })
      .from(seasons)
      .where(
        and(
          eq(seasons.organizationId, organization.id),
          isNull(seasons.archivedAt),
        ),
      )
      .orderBy(asc(seasons.startsOn));

    const [program] = season
      ? await db
          .select({
            id: programs.id,
            name: programs.name,
            status: programs.status,
          })
          .from(programs)
          .where(eq(programs.seasonId, season.id))
          .orderBy(asc(programs.name))
      : [];

    const roster = await db
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        dateOfBirth: people.dateOfBirth,
        registrationId: registrations.id,
        registrationStatus: registrations.status,
        disciplineId: registrations.disciplineId,
        abilityLevelId: registrations.abilityLevelId,
        disciplineLabel: disciplines.label,
        abilityLevelLabel: abilityLevels.label,
        notes: students.notes,
      })
      .from(students)
      .innerJoin(people, eq(students.personId, people.id))
      .leftJoin(
        registrations,
        program
          ? and(
              eq(registrations.studentId, students.personId),
              eq(registrations.programId, program.id),
              isNull(registrations.archivedAt),
            )
          : eq(registrations.studentId, students.personId),
      )
      .leftJoin(disciplines, eq(registrations.disciplineId, disciplines.id))
      .leftJoin(
        abilityLevels,
        eq(registrations.abilityLevelId, abilityLevels.id),
      )
      .where(
        and(
          eq(people.organizationId, organization.id),
          isNull(people.archivedAt),
        ),
      )
      .orderBy(asc(people.lastName), asc(people.firstName));

    const [configuredDisciplines, configuredLevels] = program
      ? await Promise.all([
          db
            .select({ id: disciplines.id, label: disciplines.label })
            .from(disciplines)
            .where(eq(disciplines.programId, program.id))
            .orderBy(asc(disciplines.displayOrder)),
          db
            .select({
              id: abilityLevels.id,
              label: abilityLevels.label,
              numericRank: abilityLevels.numericRank,
            })
            .from(abilityLevels)
            .where(eq(abilityLevels.programId, program.id))
            .orderBy(asc(abilityLevels.displayOrder)),
        ])
      : [[], []];
    const rosterIds = roster.map((student) => student.id);
    const [supportRows, guardianLinks] =
      rosterIds.length === 0
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
                  inArray(supportRecords.studentId, rosterIds),
                  eq(supportRecords.active, true),
                ),
              ),
            db
              .select({
                studentId: studentGuardians.studentId,
                guardianId: studentGuardians.guardianId,
              })
              .from(studentGuardians)
              .where(inArray(studentGuardians.studentId, rosterIds)),
          ]);
    const guardianIds = guardianLinks.map((link) => link.guardianId);
    const [guardianPeople, guardianContacts] =
      guardianIds.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select({
                id: people.id,
                firstName: people.firstName,
                lastName: people.lastName,
              })
              .from(people)
              .where(inArray(people.id, guardianIds)),
            db
              .select({
                personId: contactMethods.personId,
                kind: contactMethods.kind,
                value: contactMethods.value,
              })
              .from(contactMethods)
              .where(inArray(contactMethods.personId, guardianIds)),
          ]);
    const enrichedRoster = roster.map((student) => {
      const guardianLink = guardianLinks.find(
        (link) => link.studentId === student.id,
      );
      const guardian = guardianPeople.find(
        (person) => person.id === guardianLink?.guardianId,
      );
      return {
        ...student,
        notes: student.notes ?? "",
        medicalInfo:
          supportRows.find((support) => support.studentId === student.id)
            ?.note ?? "",
        guardianName: guardian
          ? `${guardian.firstName} ${guardian.lastName}`.trim()
          : "",
        guardianPhone:
          guardianContacts.find(
            (contact) =>
              contact.personId === guardianLink?.guardianId &&
              contact.kind === "phone",
          )?.value ?? "",
        guardianEmail:
          guardianContacts.find(
            (contact) =>
              contact.personId === guardianLink?.guardianId &&
              contact.kind === "email",
          )?.value ?? "",
      };
    });

    return {
      organization,
      season: season ?? null,
      program: program ?? null,
      students: enrichedRoster.map((student) =>
        projectStudentRosterItem(actor, student),
      ),
      disciplines: configuredDisciplines,
      abilityLevels: configuredLevels,
    };
  },
);

export const getStudent = createServerFn({ method: "GET" })
  .validator(z.object({ studentId: z.uuid() }))
  .handler(async ({ data }) => {
    const actor = await resolveActor();
    requirePermission(actor, "people:manage");
    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId));
    if (!organization) {
      return {
        programName: null,
        student: null,
        disciplines: [],
        abilityLevels: [],
      };
    }

    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(
        and(
          eq(seasons.organizationId, organization.id),
          isNull(seasons.archivedAt),
        ),
      )
      .orderBy(asc(seasons.startsOn));
    const [program] = season
      ? await db
          .select({ id: programs.id, name: programs.name })
          .from(programs)
          .where(eq(programs.seasonId, season.id))
          .orderBy(asc(programs.name))
      : [];

    const [student] = await db
      .select({
        id: people.id,
        firstName: people.firstName,
        lastName: people.lastName,
        dateOfBirth: people.dateOfBirth,
        registrationId: registrations.id,
        registrationStatus: registrations.status,
        disciplineId: registrations.disciplineId,
        abilityLevelId: registrations.abilityLevelId,
        notes: students.notes,
      })
      .from(students)
      .innerJoin(people, eq(students.personId, people.id))
      .leftJoin(
        registrations,
        program
          ? and(
              eq(registrations.studentId, students.personId),
              eq(registrations.programId, program.id),
              isNull(registrations.archivedAt),
            )
          : eq(registrations.studentId, students.personId),
      )
      .where(
        and(
          eq(students.personId, data.studentId),
          eq(people.organizationId, organization.id),
          isNull(people.archivedAt),
        ),
      );

    if (!student) {
      return {
        programName: program?.name ?? null,
        student: null,
        disciplines: [],
        abilityLevels: [],
      };
    }

    const [guardianLink] = await db
      .select({ guardianId: studentGuardians.guardianId })
      .from(studentGuardians)
      .where(eq(studentGuardians.studentId, student.id));
    const [guardian] = guardianLink
      ? await db
          .select({
            firstName: people.firstName,
            lastName: people.lastName,
          })
          .from(people)
          .where(eq(people.id, guardianLink.guardianId))
      : [];
    const guardianContacts = guardianLink
      ? await db
          .select({
            kind: contactMethods.kind,
            value: contactMethods.value,
          })
          .from(contactMethods)
          .where(eq(contactMethods.personId, guardianLink.guardianId))
      : [];
    const [support] = await db
      .select({ note: supportRecords.restrictedNote })
      .from(supportRecords)
      .where(
        and(
          eq(supportRecords.studentId, student.id),
          eq(supportRecords.active, true),
        ),
      );
    const [configuredDisciplines, configuredLevels] = program
      ? await Promise.all([
          db
            .select({ id: disciplines.id, label: disciplines.label })
            .from(disciplines)
            .where(eq(disciplines.programId, program.id))
            .orderBy(asc(disciplines.displayOrder)),
          db
            .select({
              id: abilityLevels.id,
              label: abilityLevels.label,
            })
            .from(abilityLevels)
            .where(eq(abilityLevels.programId, program.id))
            .orderBy(asc(abilityLevels.displayOrder)),
        ])
      : [[], []];

    return {
      programName: program?.name ?? null,
      disciplines: configuredDisciplines,
      abilityLevels: configuredLevels,
      student: projectStudentDetail(actor, {
        ...student,
        notes: student.notes ?? "",
        guardianName: guardian
          ? `${guardian.firstName} ${guardian.lastName}`.trim()
          : "",
        guardianPhone:
          guardianContacts.find((contact) => contact.kind === "phone")?.value ??
          "",
        guardianEmail:
          guardianContacts.find((contact) => contact.kind === "email")?.value ??
          "",
        medicalInfo: support?.note ?? "",
      }),
    };
  });
