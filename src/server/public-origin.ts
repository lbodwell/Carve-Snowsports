export type PublicOriginInput = {
  APP_ORIGIN?: string;
  BETTER_AUTH_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
};

export type PublicOriginConfig = {
  appOrigin: string;
  authUrl: string;
  trustedOrigins: Array<string>;
};

export function normalizeOrigin(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function resolvePublicOrigin(
  input: PublicOriginInput,
): PublicOriginConfig {
  const configuredApp = normalizeOrigin(input.APP_ORIGIN);
  const configuredAuth = normalizeOrigin(input.BETTER_AUTH_URL);
  const vercelUrl = normalizeOrigin(input.VERCEL_URL);
  const branchUrl = normalizeOrigin(input.VERCEL_BRANCH_URL);
  const isPreview = input.VERCEL_ENV === "preview";

  const appOrigin = isPreview && vercelUrl ? vercelUrl : configuredApp;
  const authUrl =
    isPreview && vercelUrl ? vercelUrl : (configuredAuth ?? configuredApp);

  if (!appOrigin) {
    throw new Error("APP_ORIGIN is required.");
  }
  if (!authUrl) {
    throw new Error("BETTER_AUTH_URL is required.");
  }

  const trustedOrigins = [
    ...new Set(
      [appOrigin, authUrl, configuredApp, configuredAuth, vercelUrl, branchUrl]
        .filter((origin): origin is string => Boolean(origin))
        .sort(),
    ),
  ];

  return { appOrigin, authUrl, trustedOrigins };
}
