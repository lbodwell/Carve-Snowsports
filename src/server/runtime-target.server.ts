// Framework dev workers can reload a pulled .env.local independently of the
// launcher. Local browser tests explicitly opt out of deployment metadata.
// This opt-out is ignored in production and does not change database or auth.
if (
  process.env.CARVE_LOCAL_RUNTIME === "1" &&
  process.env.NODE_ENV !== "production"
) {
  for (const key of [
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
    "VERCEL_OIDC_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
  ])
    delete process.env[key];
}
