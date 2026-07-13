import { sendEmail } from "@/server/mail/transport.server";

export function sendPasswordResetEmail(input: { email: string; url: string }) {
  return sendEmail({
    to: input.email,
    subject: "Reset your Carve password",
    text: [
      "Use the link below to reset your Carve password.",
      "",
      input.url,
      "",
      "If you did not request this reset, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>Use the link below to reset your Carve password.</p>",
      `<p><a href="${input.url}">Reset password</a></p>`,
      "<p>If you did not request this reset, you can ignore this email.</p>",
    ].join(""),
  });
}
