import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { resolvePublicOrigin } from "@/server/public-origin";

const emailFromSchema = z
  .string()
  .min(3)
  .refine((value) => {
    const angled = value.match(/<([^>]+)>$/);
    const address = angled?.[1] ?? value;
    return z.email().safeParse(address).success;
  }, "EMAIL_FROM must be an email address or 'Name <email>'");

const publicOrigin = resolvePublicOrigin({
  APP_ORIGIN: process.env.APP_ORIGIN,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_URL: process.env.VERCEL_URL,
  VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
});

export const env = createEnv({
  server: {
    APP_ORIGIN: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    DEV_IMPERSONATE_USER_EMAIL: z.email().optional(),
    EMAIL_FROM: emailFromSchema.optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    RESEND_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: {
    APP_ORIGIN: publicOrigin.appOrigin,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: publicOrigin.authUrl,
    DATABASE_URL: process.env.DATABASE_URL,
    DEV_IMPERSONATE_USER_EMAIL: process.env.DEV_IMPERSONATE_USER_EMAIL,
    EMAIL_FROM: process.env.EMAIL_FROM,
    LOG_LEVEL: process.env.LOG_LEVEL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  },
  emptyStringAsUndefined: true,
});

export const trustedOrigins = publicOrigin.trustedOrigins;
