import { eq } from "drizzle-orm";

import { closeDatabaseConnection, db } from "@/db/client.server";
import {
  abilityLevels,
  disciplines,
  organizations,
  people,
  programs,
  seasons,
  students,
  timeSlots,
} from "@/db/schema";

const organizationName = "Carve Demo Ski School";

async function seed() {
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, organizationName));
  if (existing[0]) {
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

    await tx.insert(disciplines).values([
      { programId: program.id, key: "ski", label: "Ski", displayOrder: 1 },
      {
        programId: program.id,
        key: "snowboard",
        label: "Snowboard",
        displayOrder: 2,
      },
    ]);
    await tx.insert(abilityLevels).values(
      [1, 2, 3, 4, 5, 6].map((numericRank) => ({
        programId: program.id,
        key: `level-${numericRank}`,
        label: `Level ${numericRank}`,
        numericRank,
        displayOrder: numericRank,
      })),
    );
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
    for (const [firstName, lastName, dateOfBirth] of demoStudents) {
      const [person] = await tx
        .insert(people)
        .values({
          organizationId: organization.id,
          firstName,
          lastName,
          dateOfBirth,
        })
        .returning();
      if (person) await tx.insert(students).values({ personId: person.id });
    }
  });

  console.info("Seeded Carve demo data.");
}

try {
  await seed();
} finally {
  await closeDatabaseConnection();
}
