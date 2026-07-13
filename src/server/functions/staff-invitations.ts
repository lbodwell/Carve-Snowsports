import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  acceptStaffInvitation,
  acceptStaffInvitationSchema,
  cancelStaffInvitation,
  cancelStaffInvitationSchema,
  createStaffInvitation,
  createStaffInvitationSchema,
  getStaffInvitationPreview,
  listStaffInvitations,
} from "@/application/services/staff-invitation-service.server";
import { resolveActor } from "@/server/auth/resolve-actor.server";
import { getStaffSession } from "@/server/functions/session";

export const getStaffInvitations = createServerFn({ method: "GET" }).handler(
  async () => listStaffInvitations(await resolveActor()),
);

export const inviteStaffMember = createServerFn({ method: "POST" })
  .validator(createStaffInvitationSchema)
  .handler(async ({ data }) =>
    createStaffInvitation(await resolveActor(), data),
  );

export const cancelStaffInvite = createServerFn({ method: "POST" })
  .validator(cancelStaffInvitationSchema)
  .handler(async ({ data }) =>
    cancelStaffInvitation(await resolveActor(), data),
  );

export const getInvitationPreview = createServerFn({ method: "GET" })
  .validator(z.object({ invitationId: z.uuid() }))
  .handler(async ({ data }) => getStaffInvitationPreview(data.invitationId));

export const acceptInvitation = createServerFn({ method: "POST" })
  .validator(acceptStaffInvitationSchema)
  .handler(async ({ data }) => {
    const session = await getStaffSession();
    return acceptStaffInvitation({
      ...data,
      userId: session?.user.id,
    });
  });
