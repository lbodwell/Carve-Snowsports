import { hashPassword } from "better-auth/crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Actor, Role } from "@/application/policies/authorization";
import { ApplicationError } from "@/application/errors";
import { requirePermission, roles } from "@/application/policies/authorization";
import { db } from "@/db/client.server";
import {
  accounts,
  auditEvents,
  organizationInvitations,
  organizationMemberships,
  organizations,
  users,
} from "@/db/schema";
import { sendStaffInvitationEmail } from "@/server/mail/staff-invitation-mail.server";

const invitationTtlMs = 1000 * 60 * 60 * 24 * 7;

export const createStaffInvitationSchema = z.object({
  email: z.email(),
  role: z.enum(roles),
});

export const cancelStaffInvitationSchema = z.object({
  invitationId: z.uuid(),
});

export const acceptStaffInvitationSchema = z
  .object({
    invitationId: z.uuid(),
    name: z.string().trim().min(1).max(200).optional(),
    password: z.string().min(8).max(128).optional(),
    userId: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (!value.userId && (!value.name || !value.password)) {
      context.addIssue({
        code: "custom",
        message: "Provide your name and password to create your staff account.",
        path: ["password"],
      });
    }
  });

function isInvitationExpired(expiresAt: Date) {
  return expiresAt.getTime() <= Date.now();
}

async function getPendingInvitation(invitationId: string) {
  const [invitation] = await db
    .select({
      id: organizationInvitations.id,
      organizationId: organizationInvitations.organizationId,
      organizationName: organizations.name,
      email: organizationInvitations.email,
      role: organizationInvitations.role,
      status: organizationInvitations.status,
      expiresAt: organizationInvitations.expiresAt,
    })
    .from(organizationInvitations)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationInvitations.organizationId),
    )
    .where(eq(organizationInvitations.id, invitationId));

  if (!invitation) {
    throw new ApplicationError(
      "NOT_FOUND",
      "This invitation could not be found.",
    );
  }

  if (invitation.status === "cancelled") {
    throw new ApplicationError(
      "INVALID_STATE",
      "This invitation was cancelled.",
    );
  }

  if (invitation.status === "accepted") {
    throw new ApplicationError(
      "INVALID_STATE",
      "This invitation has already been accepted.",
    );
  }

  if (
    invitation.status === "expired" ||
    isInvitationExpired(invitation.expiresAt)
  ) {
    throw new ApplicationError(
      "INVALID_STATE",
      "This invitation has expired. Ask your administrator for a new one.",
    );
  }

  return invitation;
}

export async function listStaffInvitations(actor: Actor) {
  requirePermission(actor, "people:invite");

  return db
    .select({
      id: organizationInvitations.id,
      email: organizationInvitations.email,
      role: organizationInvitations.role,
      status: organizationInvitations.status,
      expiresAt: organizationInvitations.expiresAt,
      createdAt: organizationInvitations.createdAt,
    })
    .from(organizationInvitations)
    .where(eq(organizationInvitations.organizationId, actor.organizationId))
    .orderBy(asc(organizationInvitations.createdAt));
}

export async function createStaffInvitation(
  actor: Actor,
  input: z.infer<typeof createStaffInvitationSchema>,
) {
  requirePermission(actor, "people:invite");

  const email = input.email.trim().toLowerCase();
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existingUser) {
    const [existingMembership] = await db
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, actor.organizationId),
          eq(organizationMemberships.userId, existingUser.id),
        ),
      );
    if (existingMembership) {
      throw new ApplicationError(
        "VALIDATION",
        "This person already belongs to your organization.",
        { email: ["This email already has staff access."] },
      );
    }
  }

  const expiresAt = new Date(Date.now() + invitationTtlMs);

  const invitation = await db.transaction(async (tx) => {
    await tx
      .update(organizationInvitations)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(organizationInvitations.organizationId, actor.organizationId),
          eq(organizationInvitations.email, email),
          eq(organizationInvitations.status, "pending"),
        ),
      );

    const [created] = await tx
      .insert(organizationInvitations)
      .values({
        organizationId: actor.organizationId,
        email,
        role: input.role,
        invitedByUserId: actor.userId,
        expiresAt,
      })
      .returning({
        id: organizationInvitations.id,
        email: organizationInvitations.email,
        role: organizationInvitations.role,
        expiresAt: organizationInvitations.expiresAt,
      });
    if (!created) {
      throw new ApplicationError(
        "INVALID_STATE",
        "Carve could not create the invitation.",
      );
    }

    const [organization] = await tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, actor.organizationId));
    if (!organization) {
      throw new ApplicationError(
        "NOT_FOUND",
        "The organization for this invitation could not be found.",
      );
    }

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "organization_invitation",
      entityId: created.id,
      action: "created",
      metadata: {
        email: created.email,
        role: created.role,
        expiresAt: created.expiresAt.toISOString(),
      },
    });

    await sendStaffInvitationEmail({
      email: created.email,
      invitationId: created.id,
      organizationName: organization.name,
      role: created.role,
    });

    return created;
  });

  return invitation;
}

export async function cancelStaffInvitation(
  actor: Actor,
  input: z.infer<typeof cancelStaffInvitationSchema>,
) {
  requirePermission(actor, "people:invite");

  const [invitation] = await db
    .select({
      id: organizationInvitations.id,
      status: organizationInvitations.status,
    })
    .from(organizationInvitations)
    .where(
      and(
        eq(organizationInvitations.id, input.invitationId),
        eq(organizationInvitations.organizationId, actor.organizationId),
      ),
    );

  if (!invitation) {
    throw new ApplicationError(
      "NOT_FOUND",
      "This invitation could not be found.",
    );
  }

  if (invitation.status !== "pending") {
    throw new ApplicationError(
      "INVALID_STATE",
      "Only pending invitations can be cancelled.",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(organizationInvitations)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(organizationInvitations.id, invitation.id));

    await tx.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "organization_invitation",
      entityId: invitation.id,
      action: "cancelled",
      metadata: {},
    });
  });
}

export async function getStaffInvitationPreview(invitationId: string) {
  const invitation = await getPendingInvitation(invitationId);
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invitation.email));

  return {
    invitationId: invitation.id,
    organizationName: invitation.organizationName,
    email: invitation.email,
    role: invitation.role as Role,
    requiresAccount: existingUser == null,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export async function acceptStaffInvitation(
  input: z.infer<typeof acceptStaffInvitationSchema>,
) {
  const invitation = await getPendingInvitation(input.invitationId);

  return db.transaction(async (tx) => {
    let userId = input.userId;

    if (userId) {
      const [sessionUser] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId));
      if (!sessionUser || sessionUser.email !== invitation.email) {
        throw new ApplicationError(
          "FORBIDDEN",
          "Sign in with the invited email address before accepting this invitation.",
        );
      }
    } else {
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, invitation.email));
      if (existingUser) {
        throw new ApplicationError(
          "INVALID_STATE",
          "Sign in with your existing account to accept this invitation.",
        );
      }
      if (!input.name || !input.password) {
        throw new ApplicationError(
          "VALIDATION",
          "Provide your name and password to create your staff account.",
        );
      }

      const [createdUser] = await tx
        .insert(users)
        .values({
          email: invitation.email,
          name: input.name,
          emailVerified: true,
        })
        .returning({ id: users.id });
      if (!createdUser) {
        throw new ApplicationError(
          "INVALID_STATE",
          "Carve could not create your staff account.",
        );
      }

      const passwordHash = await hashPassword(input.password);
      await tx.insert(accounts).values({
        accountId: createdUser.id,
        providerId: "credential",
        userId: createdUser.id,
        password: passwordHash,
      });
      userId = createdUser.id;
    }

    const [existingMembership] = await tx
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, invitation.organizationId),
          eq(organizationMemberships.userId, userId),
        ),
      );
    if (existingMembership) {
      throw new ApplicationError(
        "INVALID_STATE",
        "You already belong to this organization.",
      );
    }

    await tx.insert(organizationMemberships).values({
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
    });

    await tx
      .update(organizationInvitations)
      .set({
        status: "accepted",
        acceptedByUserId: userId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(organizationInvitations.id, invitation.id));

    await tx.insert(auditEvents).values({
      organizationId: invitation.organizationId,
      actorId: userId,
      entityType: "organization_invitation",
      entityId: invitation.id,
      action: "accepted",
      metadata: {
        email: invitation.email,
        role: invitation.role,
      },
    });

    return {
      role: invitation.role as Role,
      email: invitation.email,
    };
  });
}
