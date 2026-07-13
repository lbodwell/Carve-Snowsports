import { and, eq } from "drizzle-orm";
import { getRequestHeaders } from "@tanstack/react-start/server";

import type { Actor, Role } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { roles } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import { organizationMemberships, users } from "@/db/schema";
import { auth } from "@/server/auth/auth.server";
import { env } from "@/server/env.server";

function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}

async function resolveUserId(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (session?.user.id) return session.user.id;

  if (process.env.NODE_ENV !== "production" && env.DEV_IMPERSONATE_USER_EMAIL) {
    const [developmentUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, env.DEV_IMPERSONATE_USER_EMAIL));
    if (developmentUser) return developmentUser.id;
  }

  throw new ApplicationError(
    "UNAUTHENTICATED",
    "Sign in to access this workspace.",
  );
}

export async function resolveActor(
  options: { organizationId?: string; headers?: Headers } = {},
): Promise<Actor> {
  const userId = await resolveUserId(options.headers ?? getRequestHeaders());
  const [membership] = await db
    .select({
      organizationId: organizationMemberships.organizationId,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .where(
      options.organizationId
        ? and(
            eq(organizationMemberships.userId, userId),
            eq(organizationMemberships.organizationId, options.organizationId),
          )
        : eq(organizationMemberships.userId, userId),
    );

  if (!membership || !isRole(membership.role)) {
    throw new ApplicationError(
      "FORBIDDEN",
      "You do not have access to this organization.",
    );
  }

  return {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}
