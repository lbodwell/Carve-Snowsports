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

export async function sendEmail(email: OutboundEmail) {
  if (canDeliverProductionEmail()) {
    await sendWithResend(email);
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(formatConsoleEmail(email));
    return;
  }

  console.warn(
    `[mail] Production email delivery is not configured. Message to ${email.to} was not sent.`,
  );
}
