import { Link, useLocation } from "@tanstack/react-router";
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
  PanelLeftClose,
  PanelLeftOpen,
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
import { cn } from "@/lib/utils";

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

export function AdminShell({
  children,
  workspace = false,
}: {
  children: ReactNode;
  workspace?: boolean;
}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<Awaited<
    ReturnType<typeof getStaffSession>
  > | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const pathname = useLocation({ select: (location) => location.pathname });
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  useEffect(() => {
    setIsHydrated(true);
    try {
      setNavigationCollapsed(
        window.localStorage.getItem("carve.navigationCollapsed") === "true",
      );
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
    void getStaffSession().then(setSession);
  }, []);

  const navigation = session
    ? navigationForRole(session.role as Role)
    : navigationForRole("admin");

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  function toggleNavigation() {
    const collapsed = !navigationCollapsed;
    setNavigationCollapsed(collapsed);
    try {
      window.localStorage.setItem(
        "carve.navigationCollapsed",
        String(collapsed),
      );
    } catch {
      // Keep the current choice for this page when storage is unavailable.
    }
  }

  return (
    <div
      className={cn(
        "staff-workspace bg-pm-cream/70 min-h-svh",
        workspace && "xl:flex xl:h-dvh xl:flex-col xl:overflow-hidden",
      )}
    >
      <header className="border-pm-orange bg-pm-forest shrink-0 border-t-4 text-white shadow-sm">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-2 sm:px-6">
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

      <div
        className={cn(
          "flex w-full flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row",
          workspace && "lg:gap-3 lg:px-4 xl:min-h-0 xl:flex-1 xl:py-3",
        )}
      >
        <nav
          aria-label="Admin navigation"
          className={cn(
            "bg-background hidden h-fit shrink-0 rounded-xl border p-2 shadow-sm lg:sticky lg:top-5 lg:flex lg:flex-col lg:gap-1",
            navigationCollapsed ? "lg:w-14 lg:p-1.5" : "lg:w-44",
          )}
        >
          <Button
            type="button"
            variant="ghost"
            disabled={!isHydrated}
            onClick={toggleNavigation}
            aria-label={
              navigationCollapsed ? "Expand navigation" : "Collapse navigation"
            }
            aria-expanded={!navigationCollapsed}
            title={
              navigationCollapsed ? "Expand navigation" : "Collapse navigation"
            }
            className={cn(
              "mb-1 h-9 border-b text-xs",
              navigationCollapsed
                ? "justify-center px-0"
                : "justify-start px-3",
            )}
          >
            {navigationCollapsed ? (
              <PanelLeftOpen aria-hidden />
            ) : (
              <PanelLeftClose aria-hidden />
            )}
          </Button>
          {navigation.map((item) => {
            const Icon =
              navigationIcons[item.to as keyof typeof navigationIcons];
            return (
              <Link
                key={item.to}
                to={item.to}
                title={navigationCollapsed ? item.label : undefined}
                aria-label={navigationCollapsed ? item.label : undefined}
                activeOptions={{ exact: item.exact ?? false }}
                className={cn(
                  "text-muted-foreground hover:bg-pm-mist hover:text-pm-forest flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                  navigationCollapsed && "lg:justify-center lg:px-0",
                )}
                activeProps={{
                  className: cn(
                    "flex h-9 items-center gap-2 rounded-lg bg-pm-forest px-3 text-sm font-medium text-white",
                    navigationCollapsed && "lg:justify-center lg:px-0",
                  ),
                }}
              >
                <Icon aria-hidden />
                <span
                  className={navigationCollapsed ? "lg:sr-only" : undefined}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <main
          className={cn(
            "min-w-0 flex-1",
            workspace && "xl:flex xl:min-h-0 xl:flex-col",
          )}
        >
          <fieldset
            className={
              workspace
                ? "m-0 min-h-0 min-w-0 border-0 p-0 xl:flex xl:flex-1 xl:flex-col xl:overflow-hidden"
                : "contents"
            }
            disabled={!isHydrated}
          >
            {children}
          </fieldset>
        </main>
      </div>
    </div>
  );
}
