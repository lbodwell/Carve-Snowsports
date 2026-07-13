import { ApplicationError } from "@/application/errors";

export const roles = ["admin", "coordinator", "instructor"] as const;
export type Role = (typeof roles)[number];

export type Actor = {
  userId: string;
  organizationId: string;
  role: Role;
};

export type Permission =
  | "program:manage"
  | "people:manage"
  | "people:invite"
  | "grouping:edit"
  | "grouping:approve"
  | "lesson:operate"
  | "import:manage";

const permissions: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set([
    "program:manage",
    "people:manage",
    "people:invite",
    "grouping:edit",
    "grouping:approve",
    "lesson:operate",
    "import:manage",
  ]),
  coordinator: new Set([
    "program:manage",
    "people:manage",
    "grouping:edit",
    "lesson:operate",
    "import:manage",
  ]),
  instructor: new Set(["lesson:operate"]),
};

export function hasPermission(
  actor: Pick<Actor, "role">,
  permission: Permission,
) {
  return permissions[actor.role].has(permission);
}

export function requirePermission(actor: Actor, permission: Permission) {
  if (!hasPermission(actor, permission)) {
    throw new ApplicationError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
}

export function getStaffHomePath(role: Role): "/admin" | "/lessons" {
  return role === "instructor" ? "/lessons" : "/admin";
}

type StaffNavigationItem = {
  to: string;
  label: string;
  exact?: boolean;
  permission: Permission;
};

export const staffNavigation = [
  {
    to: "/admin",
    label: "Overview",
    exact: true,
    permission: "program:manage",
  },
  { to: "/admin/seasons", label: "Seasons", permission: "program:manage" },
  { to: "/admin/students", label: "Students", permission: "people:manage" },
  {
    to: "/admin/audit",
    label: "Audit",
    permission: "people:manage",
  },
  {
    to: "/admin/instructors",
    label: "Instructors",
    permission: "people:manage",
  },
  { to: "/grouping", label: "Grouping", permission: "grouping:edit" },
  { to: "/admin/staff", label: "Staff", permission: "people:invite" },
] as const;

export const instructorNavigation = [
  {
    to: "/lessons",
    label: "Lessons",
    exact: true,
    permission: "lesson:operate",
  },
] as const;

export function navigationForRole(role: Role): Array<StaffNavigationItem> {
  if (role === "instructor") {
    return [...instructorNavigation];
  }

  return staffNavigation.filter((item) =>
    hasPermission({ role }, item.permission),
  );
}
