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
  | "grouping:edit"
  | "grouping:approve"
  | "lesson:operate"
  | "import:manage";

const permissions: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set([
    "program:manage",
    "people:manage",
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

export function requirePermission(actor: Actor, permission: Permission) {
  if (!permissions[actor.role].has(permission)) {
    throw new ApplicationError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
}
