import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "@/db/client.server";
import * as schema from "@/db/schema";
import { sendPasswordResetEmail } from "@/server/mail/password-reset-mail.server";
import { env } from "@/server/env.server";

export const auth = betterAuth({
  appName: "Carve",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_ORIGIN],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ email: user.email, url });
    },
  },
  plugins: [tanstackStartCookies()],
});
