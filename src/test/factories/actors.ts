import type { Actor } from "@/application/policies/authorization";

export function createActor(
  overrides: Partial<Actor> & Pick<Actor, "role">,
): Actor {
  return {
    userId: overrides.userId ?? "00000000-0000-4000-8000-000000000001",
    organizationId:
      overrides.organizationId ?? "00000000-0000-4000-8000-000000000010",
    role: overrides.role,
  };
}

export const adminActor = createActor({ role: "admin" });
export const coordinatorActor = createActor({ role: "coordinator" });
export const instructorActor = createActor({ role: "instructor" });
