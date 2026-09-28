import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { closeDatabaseConnection, db } from "@/db/client.server";
import {
  abilityLevels,
  accounts,
  ageBands,
  contactMethods,
  disciplines,
  instructorQualifications,
  instructors,
  organizationMemberships,
  organizations,
  people,
  programs,
  registrations,
  seasons,
  students,
  surveys,
  timeSlots,
  users,
} from "@/db/schema";

const organizationName = "Carve Demo Ski School";
const developmentAdminEmail = "admin@carve.local";
const developmentAdminPassword =
  process.env.DEV_ADMIN_PASSWORD ?? "carve-local-admin";

async function seedDemoSurvey(organizationId: string) {
  await db
    .insert(surveys)
    .values({
      organizationId,
      slug: "pre-lesson",
      title: "Pre-lesson student information",
      status: "open",
      definitionKey: "pre_lesson_intake",
      definitionVersion: 1,
      allowAnonymous: true,
    })
    .onConflictDoNothing();
}

async function seedDevelopmentAdmin(organizationId: string) {
  let [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, developmentAdminEmail));

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: developmentAdminEmail,
        name: "Local Carve Admin",
        emailVerified: true,
      })
      .returning({ id: users.id });
  }
  if (!user) throw new Error("Unable to create the local admin user.");

  const passwordHash = await hashPassword(developmentAdminPassword);
  await db
    .insert(accounts)
    .values({
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    })
    .onConflictDoUpdate({
      target: [accounts.providerId, accounts.accountId],
      set: {
        password: passwordHash,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(organizationMemberships)
    .values({ organizationId, userId: user.id, role: "admin" })
    .onConflictDoNothing();
}

async function seed() {
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, organizationName));
  if (existing[0]) {
    await seedDevelopmentAdmin(existing[0].id);
    await seedDemoSurvey(existing[0].id);
    console.info("Demo data already exists.");
    return;
  }

  await db.transaction(async (tx) => {
    const [organization] = await tx
      .insert(organizations)
      .values({ name: organizationName, timezone: "America/New_York" })
      .returning();
    if (!organization) throw new Error("Unable to create demo organization.");

    const [season] = await tx
      .insert(seasons)
      .values({
        organizationId: organization.id,
        name: "Winter 2026",
        startsOn: "2026-01-03",
        endsOn: "2026-03-22",
        status: "active",
      })
      .returning();
    if (!season) throw new Error("Unable to create demo season.");

    const [program] = await tx
      .insert(programs)
      .values({
        seasonId: season.id,
        name: "Weekend Snowsports",
        status: "active",
      })
      .returning();
    if (!program) throw new Error("Unable to create demo program.");

    const configuredDisciplines = await tx
      .insert(disciplines)
      .values([
        { programId: program.id, key: "ski", label: "Ski", displayOrder: 1 },
        {
          programId: program.id,
          key: "snowboard",
          label: "Snowboard",
          displayOrder: 2,
        },
      ])
      .returning();
    const configuredLevels = await tx
      .insert(abilityLevels)
      .values(
        [1, 2, 3, 4, 5, 6].map((numericRank) => ({
          programId: program.id,
          key: `level-${numericRank}`,
          label: `Level ${numericRank}`,
          numericRank,
          displayOrder: numericRank,
        })),
      )
      .returning();
    await tx.insert(ageBands).values([
      {
        programId: program.id,
        label: "Ages 4–6",
        minimumAge: 4,
        maximumAge: 6,
        displayOrder: 1,
      },
      {
        programId: program.id,
        label: "Ages 7–12",
        minimumAge: 7,
        maximumAge: 12,
        displayOrder: 2,
      },
    ]);
    await tx.insert(timeSlots).values([
      {
        programId: program.id,
        key: "am",
        label: "Morning",
        startsAt: "09:00",
        endsAt: "12:00",
        displayOrder: 1,
      },
      {
        programId: program.id,
        key: "pm",
        label: "Afternoon",
        startsAt: "13:00",
        endsAt: "16:00",
        displayOrder: 2,
      },
    ]);

    const demoStudents = [
      ["Avery", "Chen", "2017-01-08"],
      ["Rowan", "Patel", "2016-03-14"],
      ["Mika", "Flores", "2015-09-21"],
      ["Remy", "Morgan", "2017-05-02"],
      ["Lina", "Kim", "2016-11-18"],
    ] as const;
    for (const [
      index,
      [firstName, lastName, dateOfBirth],
    ] of demoStudents.entries()) {
      const [person] = await tx
        .insert(people)
        .values({
          organizationId: organization.id,
          firstName,
          lastName,
          dateOfBirth,
        })
        .returning();
      if (person) {
        await tx.insert(students).values({ personId: person.id });
        await tx.insert(registrations).values({
          studentId: person.id,
          programId: program.id,
          status: "active",
          disciplineId:
            configuredDisciplines[index % configuredDisciplines.length]?.id,
          abilityLevelId: configuredLevels[(index % 3) + 1]?.id,
        });
      }
    }

    const demoInstructors = [
      ["Jordan", "Lee", "jordan.lee@example.test", ["ski"]],
      ["Casey", "Nguyen", "casey.nguyen@example.test", ["ski", "snowboard"]],
      ["Morgan", "Rivera", "morgan.rivera@example.test", ["snowboard"]],
    ] as const;
    for (const [
      firstName,
      lastName,
      email,
      disciplineKeys,
    ] of demoInstructors) {
      const [person] = await tx
        .insert(people)
        .values({ organizationId: organization.id, firstName, lastName })
        .returning();
      if (!person) continue;
      await tx.insert(instructors).values({ personId: person.id });
      await tx.insert(contactMethods).values({
        personId: person.id,
        kind: "email",
        value: email,
        isPrimary: true,
      });
      await tx.insert(instructorQualifications).values(
        configuredDisciplines
          .filter((discipline) =>
            disciplineKeys.some((key) => key === discipline.key),
          )
          .map((discipline) => ({
            instructorId: person.id,
            disciplineId: discipline.id,
          })),
      );
    }
  });

  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, organizationName));
  if (!organization) throw new Error("Unable to find the demo organization.");
  await seedDevelopmentAdmin(organization.id);
  await seedDemoSurvey(organization.id);

  console.info("Seeded Carve demo data.");
}

try {
  await seed();
} finally {
  await closeDatabaseConnection();
}
