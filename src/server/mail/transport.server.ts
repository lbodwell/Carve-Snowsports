import { ApplicationError } from "@/application/errors";
import { env } from "@/server/env.server";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function formatConsoleEmail(email: OutboundEmail) {
  return `[mail] To: ${email.to}\nSubject: ${email.subject}\n${email.text}`;
}

async function sendWithResend(email: OutboundEmail) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "RESEND_API_KEY and EMAIL_FROM are required to send production email.",
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Resend rejected the email (${response.status}): ${errorBody}`,
    );
  }
}

export function canDeliverProductionEmail() {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export function requireDeliverableEmail(
  nodeEnv = process.env.NODE_ENV,
  configured = canDeliverProductionEmail(),
) {
  if (nodeEnv === "production" && !configured) {
    throw new ApplicationError(
      "INVALID_STATE",
      "Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM before inviting staff or sending password resets.",
    );
  }
}

export async function sendEmail(email: OutboundEmail) {
  if (canDeliverProductionEmail()) {
    await sendWithResend(email);
    return;
  }

  requireDeliverableEmail();

  console.info(formatConsoleEmail(email));
}
