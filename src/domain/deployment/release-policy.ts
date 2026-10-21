export type ReleaseTarget = {
  projectId: string;
  orgId: string;
  scope: string;
  projectName: string;
  repoOwner: string;
  repoName: string;
  branch: string;
};

export function assertReleaseFiles(files: ReadonlyArray<{ path: string }>) {
  const excludedRoots = new Set([
    ".agents",
    ".codex",
    ".cursor",
    ".git",
    ".github",
    ".vercel",
    ".local-imports",
    ".workflow-data",
    ".tmp",
    ".output",
    ".nitro",
    "imports",
    "docs",
    "tests",
    "test-results",
    "playwright-report",
    "node_modules",
  ]);
  if (
    !files.length ||
    files.some(({ path }) => {
      const parts = path.replaceAll("\\", "/").split("/");
      const filename = parts.at(-1)!;
      return (
        !parts[0] ||
        parts.includes("..") ||
        excludedRoots.has(parts[0]) ||
        (filename.startsWith(".env") && path !== ".env.example") ||
        filename.endsWith(".log")
      );
    })
  )
    throw new Error("Deployment inputs include local-only files or are empty.");
  for (const required of ["vercel.json", "src/server/env.server.ts"])
    if (!files.some(({ path }) => path === required))
      throw new Error(
        "Deployment inputs are missing required application files.",
      );
}

export function verifiedDeploymentOrigin(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    !url.hostname.endsWith(".vercel.app") ||
    url.username ||
    url.password
  )
    throw new Error("Expected an exact HTTPS Vercel deployment origin.");
  return url.origin;
}

export function readStagedDeployment(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("Expected structured Vercel deployment output.");
  const output = value as {
    status?: unknown;
    deployment?: { id?: unknown; url?: unknown };
  };
  const deployment = output.deployment;
  if (
    output.status !== "ok" ||
    typeof deployment?.id !== "string" ||
    !/^dpl_[a-zA-Z0-9]+$/.test(deployment.id) ||
    typeof deployment.url !== "string"
  )
    throw new Error(
      "Vercel did not return a successful structured deployment.",
    );
  return {
    id: deployment.id,
    url: verifiedDeploymentOrigin(deployment.url),
  };
}

export function isReleasePromoted(
  project: {
    id?: string;
    accountId?: string;
    targets?: { production?: { id?: string } };
    lastAliasRequest?: { jobStatus?: string; toDeploymentId?: string };
  },
  target: ReleaseTarget,
  deploymentId: string,
) {
  if (project.id !== target.projectId || project.accountId !== target.orgId)
    throw new Error("Promotion status returned the wrong project.");
  const request = project.lastAliasRequest;
  if (
    request?.toDeploymentId === deploymentId &&
    request.jobStatus === "failed"
  )
    throw new Error("Production alias assignment failed.");
  return (
    request?.toDeploymentId === deploymentId &&
    request.jobStatus === "succeeded" &&
    project.targets?.production?.id === deploymentId
  );
}

export function assertReleaseDeployment(
  data: {
    projectId?: string;
    ownerId?: string;
    target?: string;
    readyState?: string;
    url?: string;
    meta?: { githubCommitSha?: string };
  },
  expected: ReleaseTarget,
  sha: string,
  origin: string,
) {
  if (!/^[a-f0-9]{40}$/.test(sha))
    throw new Error("A full tested commit SHA is required.");
  verifiedDeploymentOrigin(origin);
  if (
    data.projectId !== expected.projectId ||
    data.ownerId !== expected.orgId ||
    data.target !== "production" ||
    data.readyState !== "READY" ||
    data.meta?.githubCommitSha !== sha ||
    `https://${data.url}` !== origin
  )
    throw new Error(
      "Deployment team, project, target, state, URL, or commit did not match the tested release.",
    );
}

export function assertMigrationHistory(
  committed: ReadonlyArray<{ folderMillis: number; hash: string }>,
  applied: ReadonlyArray<{ created_at: string | number | null; hash: string }>,
) {
  if (
    !committed.length ||
    committed.some(
      (entry, index) =>
        index > 0 && entry.folderMillis <= committed[index - 1]!.folderMillis,
    )
  )
    throw new Error(
      "The committed migration journal must be nonempty and strictly ordered.",
    );
  if (
    applied.length > committed.length ||
    applied.some((entry, index) => {
      const planned = committed[index];
      return (
        !planned ||
        entry.hash !== planned.hash ||
        Number(entry.created_at) !== planned.folderMillis
      );
    })
  )
    throw new Error(
      "Database migration history differs from this commit. Refusing a stale release or changed historical migration.",
    );
}

export function verifiedMigrationTarget(
  env: Record<string, string | undefined>,
) {
  const environment = env.RELEASE_ENVIRONMENT;
  if (!environment || !["production", "preview", "test"].includes(environment))
    throw new Error("Set RELEASE_ENVIRONMENT to production, preview, or test.");
  if (
    !env.DATABASE_URL_UNPOOLED ||
    !env.RELEASE_DATABASE_HOST ||
    !env.RELEASE_DATABASE_NAME
  )
    throw new Error(
      "Direct database credentials and expected database host/name are required.",
    );
  const url = new URL(env.DATABASE_URL_UNPOOLED);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== env.RELEASE_DATABASE_HOST ||
    decodeURIComponent(url.pathname.slice(1)) !== env.RELEASE_DATABASE_NAME ||
    url.hostname.includes("-pooler")
  )
    throw new Error(
      "Database URL does not match the expected direct database target.",
    );
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname,
  );
  if (
    environment === "test"
      ? !local || env.RELEASE_DATABASE_NAME !== "carve_test"
      : local || !url.hostname.endsWith(".neon.tech")
  )
    throw new Error(
      "Release databases must be Neon; tests must use the local carve_test database.",
    );
  return {
    environment,
    url: env.DATABASE_URL_UNPOOLED,
    ssl: environment !== "test",
  };
}
