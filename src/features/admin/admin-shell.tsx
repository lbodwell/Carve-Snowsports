import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { Role } from "@/application/policies/authorization";
import {
  getStaffHomePath,
  navigationForRole,
} from "@/application/policies/authorization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient } from "@/features/auth/auth-client";
import { getStaffSession } from "@/server/functions/session";

const navigationIcons = {
  "/admin": LayoutDashboard,
  "/admin/seasons": CalendarRange,
  "/admin/students": UsersRound,
  "/admin/audit": History,
  "/admin/instructors": GraduationCap,
  "/grouping": CalendarDays,
  "/admin/staff": UserPlus,
  "/lessons": CalendarDays,
} as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof getStaffSession>
  > | null>(null);

  useEffect(() => {
    void getStaffSession().then(setSession);
  }, []);

  const navigation = session
    ? navigationForRole(session.role as Role)
    : navigationForRole("admin");

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  return (
    <div className="bg-muted/30 min-h-svh">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            to={session ? getStaffHomePath(session.role as Role) : "/admin"}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-semibold">
              C
            </span>
            <span className="truncate text-sm font-semibold">Carve</span>
            <Badge variant="secondary">Staff workspace</Badge>
          </Link>
          <div className="flex items-center gap-3">
            {session ? (
              <p className="text-muted-foreground hidden text-sm sm:block">
                {session.user.name}
              </p>
            ) : null}
            <Button type="button" variant="ghost" onClick={signOut}>
              <LogOut aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
        <nav
          aria-label="Admin navigation"
          className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col"
        >
          {navigation.map((item) => {
            const Icon =
              navigationIcons[item.to as keyof typeof navigationIcons];
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact ?? false }}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors"
                activeProps={{
                  className:
                    "flex h-9 items-center gap-2 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground",
                }}
              >
                <Icon aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
