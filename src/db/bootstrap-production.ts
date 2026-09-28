import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { closeDatabaseConnection, db } from "@/db/client.server";
import { readProductionBootstrapConfig } from "@/db/production-bootstrap";
import {
  accounts,
  organizationMemberships,
  organizations,
  surveys,
  users,
} from "@/db/schema";

async function bootstrap() {
  const config = readProductionBootstrapConfig(process.env);
  const existingOrganizations = await db
    .select({ id: organizations.id })
    .from(organizations);

  if (existingOrganizations.length > 0 && !config.allowExisting) {
    throw new Error(
      "An organization already exists. Set BOOTSTRAP_ALLOW_EXISTING=yes to add or update the named organization.",
    );
  }

  let [organization] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.name, config.organizationName));

  if (!organization) {
    [organization] = await db
      .insert(organizations)
      .values({
        name: config.organizationName,
        timezone: config.timezone,
      })
      .returning({ id: organizations.id, name: organizations.name });
    if (!organization) throw new Error("Unable to create the organization.");
    console.info(`Created organization ${organization.name}.`);
  } else {
    console.info(`Using existing organization ${organization.name}.`);
  }

  await db
    .insert(surveys)
    .values({
      organizationId: organization.id,
      slug: config.surveySlug,
      title: "Pre-lesson student information",
      status: "open",
      definitionKey: "pre_lesson_intake",
      definitionVersion: 1,
      allowAnonymous: true,
    })
    .onConflictDoNothing();

  let [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, config.adminEmail));

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: config.adminEmail,
        name: config.adminName,
        emailVerified: true,
      })
      .returning({ id: users.id });
    if (!user) throw new Error("Unable to create the admin user.");
    console.info(`Created admin ${config.adminEmail}.`);
  } else {
    console.info(`Using existing admin ${config.adminEmail}.`);
  }

  const [existingAccount] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.providerId, "credential"),
        eq(accounts.accountId, user.id),
      ),
    );

  if (!existingAccount || config.resetAdminPassword) {
    const passwordHash = await hashPassword(config.adminPassword);
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
    console.info(
      existingAccount
        ? "Updated the admin password."
        : "Created the admin credential.",
    );
  } else {
    console.info("Left the existing admin password unchanged.");
  }

  await db
    .insert(organizationMemberships)
    .values({
      organizationId: organization.id,
      userId: user.id,
      role: "admin",
    })
    .onConflictDoNothing();

  console.info(
    `Bootstrap complete for ${organization.name}. Sign in at /sign-in as ${config.adminEmail}.`,
  );
}

try {
  await bootstrap();
} finally {
  await closeDatabaseConnection();
}
