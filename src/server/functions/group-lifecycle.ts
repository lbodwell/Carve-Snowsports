import { createServerFn } from "@tanstack/react-start";
import { resolveActor } from "@/server/auth/resolve-actor.server";
import {
  decideGroupChange,
  decideGroupChangeSchema,
  getGroupLifecycle,
  lifecycleQuerySchema,
  proposeGroupChange,
  proposeGroupChangeSchema,
} from "@/application/services/group-lifecycle-service.server";

export const getLifecycle = createServerFn({ method: "GET" })
  .validator(lifecycleQuerySchema)
  .handler(async ({ data }) => getGroupLifecycle(await resolveActor(), data));
export const requestGroupChange = createServerFn({ method: "POST" })
  .validator(proposeGroupChangeSchema)
  .handler(async ({ data }) => proposeGroupChange(await resolveActor(), data));
export const reviewGroupChange = createServerFn({ method: "POST" })
  .validator(decideGroupChangeSchema)
  .handler(async ({ data }) => decideGroupChange(await resolveActor(), data));
