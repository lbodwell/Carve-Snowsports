import { asc, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";

import { db } from "@/db/client.server";
import { organizations, people, students } from "@/db/schema";

export const getDemoRoster = createServerFn({ method: "GET" }).handler(
  async () => {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Carve Demo Ski School"));
    if (!organization) return { organization: null, students: [] };

    const roster = await db
      .select({
        firstName: people.firstName,
        lastName: people.lastName,
        dateOfBirth: people.dateOfBirth,
      })
      .from(students)
      .innerJoin(people, eq(students.personId, people.id))
      .where(eq(people.organizationId, organization.id))
      .orderBy(asc(people.lastName), asc(people.firstName));
    return { organization, students: roster };
  },
);
