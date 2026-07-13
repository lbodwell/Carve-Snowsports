import { sendEmail } from "@/server/mail/transport.server";
import { env } from "@/server/env.server";

type StaffInvitationEmail = {
  email: string;
  invitationId: string;
  organizationName: string;
  role: string;
};

export function buildStaffInvitationUrl(invitationId: string) {
  return new URL(
    `/accept-invitation/${invitationId}`,
    env.APP_ORIGIN,
  ).toString();
}

export function sendStaffInvitationEmail(invitation: StaffInvitationEmail) {
  const inviteUrl = buildStaffInvitationUrl(invitation.invitationId);

  return sendEmail({
    to: invitation.email,
    subject: `Join ${invitation.organizationName} on Carve`,
    text: [
      `You have been invited to join ${invitation.organizationName} on Carve as a ${invitation.role}.`,
      "",
      `Accept your invitation: ${inviteUrl}`,
      "",
      "This link expires in seven days.",
    ].join("\n"),
    html: [
      `<p>You have been invited to join <strong>${invitation.organizationName}</strong> on Carve as a <strong>${invitation.role}</strong>.</p>`,
      `<p><a href="${inviteUrl}">Accept your invitation</a></p>`,
      "<p>This link expires in seven days.</p>",
    ].join(""),
  });
}
