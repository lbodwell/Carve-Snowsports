import { z } from "zod";

export const productionBootstrapSchema = z
  .object({
    organizationName: z.string().trim().min(2).max(200),
    timezone: z.string().trim().min(1).max(100).default("America/New_York"),
    adminEmail: z.email(),
    adminName: z.string().trim().min(1).max(200).default("Organization Admin"),
    adminPassword: z.string().min(12).max(128),
    surveySlug: z.string().trim().min(1).max(100).default("pre-lesson"),
    nodeEnv: z.string().optional(),
    confirmProductionBootstrap: z.string().optional(),
    allowExisting: z.boolean().default(false),
    resetAdminPassword: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.organizationName.toLowerCase() === "carve demo ski school") {
      context.addIssue({
        code: "custom",
        path: ["organizationName"],
        message:
          "Refusing to bootstrap the demo organization. Use db:seed locally instead.",
      });
    }

    const email = value.adminEmail.toLowerCase();
    if (email.endsWith("@carve.local") || email.endsWith("@example.test")) {
      context.addIssue({
        code: "custom",
        path: ["adminEmail"],
        message: "Bootstrap requires a real staff email address.",
      });
    }

    if (value.adminPassword === "carve-local-admin") {
      context.addIssue({
        code: "custom",
        path: ["adminPassword"],
        message: "Choose a unique production password.",
      });
    }

    if (
      value.nodeEnv === "production" &&
      value.confirmProductionBootstrap !== "yes"
    ) {
      context.addIssue({
        code: "custom",
        path: ["confirmProductionBootstrap"],
        message:
          "Set CONFIRM_PRODUCTION_BOOTSTRAP=yes to bootstrap a production database.",
      });
    }
  });

export type ProductionBootstrapConfig = z.infer<
  typeof productionBootstrapSchema
>;

export function readProductionBootstrapConfig(
  env: NodeJS.ProcessEnv,
): ProductionBootstrapConfig {
  return productionBootstrapSchema.parse({
    organizationName: env.BOOTSTRAP_ORGANIZATION_NAME,
    timezone: env.BOOTSTRAP_TIMEZONE,
    adminEmail: env.BOOTSTRAP_ADMIN_EMAIL,
    adminName: env.BOOTSTRAP_ADMIN_NAME,
    adminPassword: env.BOOTSTRAP_ADMIN_PASSWORD,
    surveySlug: env.BOOTSTRAP_SURVEY_SLUG,
    nodeEnv: env.NODE_ENV,
    confirmProductionBootstrap: env.CONFIRM_PRODUCTION_BOOTSTRAP,
    allowExisting: env.BOOTSTRAP_ALLOW_EXISTING === "yes",
    resetAdminPassword: env.BOOTSTRAP_RESET_ADMIN_PASSWORD === "yes",
  });
}
