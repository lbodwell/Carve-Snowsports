import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileUp,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { authClient } from "@/features/auth/auth-client";
import { getStaffSession } from "@/server/functions/session";

const navigationIcons = {
  "/admin": LayoutDashboard,
  "/admin/seasons": CalendarRange,
  "/admin/students": UsersRound,
  "/admin/surveys": ClipboardList,
  "/admin/audit": History,
  "/admin/instructors": GraduationCap,
  "/admin/imports": FileUp,
  "/grouping": CalendarDays,
  "/admin/staff": UserPlus,
  "/lessons": CalendarDays,
} as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof getStaffSession>
  > | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

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
    <div className="staff-workspace bg-pm-cream/70 min-h-svh">
      <header className="border-pm-orange bg-pm-forest border-t-4 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet
              open={mobileNavigationOpen}
              onOpenChange={setMobileNavigationOpen}
            >
              <SheetTrigger asChild>
                <Button
                  className="text-white hover:bg-white/10 hover:text-white lg:hidden"
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Open staff navigation"
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent
                className="staff-workspace bg-pm-cream/95"
                side="left"
              >
                <SheetHeader className="bg-pm-forest border-b text-left">
                  <SheetTitle className="text-white">
                    Pleasant Mountain
                  </SheetTitle>
                  <SheetDescription className="text-white/70">
                    Staff workspace navigation
                  </SheetDescription>
                </SheetHeader>
                <nav
                  aria-label="Mobile admin navigation"
                  className="flex flex-col gap-1 p-3"
                >
                  {navigation.map((item) => {
                    const Icon =
                      navigationIcons[item.to as keyof typeof navigationIcons];
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        activeOptions={{ exact: item.exact ?? false }}
                        onClick={() => setMobileNavigationOpen(false)}
                        className="text-muted-foreground hover:bg-pm-mist hover:text-pm-forest flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors"
                        activeProps={{
                          className:
                            "flex h-10 items-center gap-2 rounded-lg bg-pm-forest px-3 text-sm font-medium text-white",
                        }}
                      >
                        <Icon aria-hidden="true" />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>
            <Link
              to={session ? getStaffHomePath(session.role as Role) : "/admin"}
              className="flex min-w-0 items-center gap-3"
            >
              <span className="bg-pm-orange flex size-9 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm">
                PM
              </span>
              <span className="truncate text-sm font-semibold">
                Pleasant Mountain
              </span>
              <Badge className="hidden border-white/15 bg-white/10 text-white sm:inline-flex">
                Staff workspace
              </Badge>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {session ? (
              <p className="hidden text-sm text-white/75 sm:block">
                {session.user.name}
              </p>
            ) : null}
            <Button
              className="text-white hover:bg-white/10 hover:text-white"
              type="button"
              variant="ghost"
              onClick={signOut}
            >
              <LogOut aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
        <nav
          aria-label="Admin navigation"
          className="bg-background hidden h-fit shrink-0 rounded-2xl border p-2 shadow-sm lg:flex lg:w-52 lg:flex-col lg:gap-1"
        >
          {navigation.map((item) => {
            const Icon =
              navigationIcons[item.to as keyof typeof navigationIcons];
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact ?? false }}
                className="text-muted-foreground hover:bg-pm-mist hover:text-pm-forest flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors"
                activeProps={{
                  className:
                    "flex h-9 items-center gap-2 rounded-lg bg-pm-forest px-3 text-sm font-medium text-white",
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
