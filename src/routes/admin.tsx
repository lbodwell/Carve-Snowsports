import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import type { Role } from "@/application/policies/authorization";
import { getStaffHomePath } from "@/application/policies/authorization";
import { getStaffSession } from "@/server/functions/session";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const session = await getStaffSession();
    if (!session) {
      throw redirect({ to: "/sign-in" });
    }
    if (session.role === "instructor") {
      throw redirect({ to: getStaffHomePath(session.role as Role) });
    }
  },
  component: Outlet,
});
