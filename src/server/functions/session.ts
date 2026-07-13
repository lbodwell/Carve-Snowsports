import { eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { db } from "@/db/client.server";
import { organizationMemberships, organizations } from "@/db/schema";
import { auth } from "@/server/auth/auth.server";

export const getStaffSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session) return null;

    const [membership] = await db
      .select({
        organizationId: organizationMemberships.organizationId,
        organizationName: organizations.name,
        role: organizationMemberships.role,
      })
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizations.id, organizationMemberships.organizationId),
      )
      .where(eq(organizationMemberships.userId, session.user.id));

    if (!membership) return null;

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      ...membership,
    };
  },
);
