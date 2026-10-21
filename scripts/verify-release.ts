import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  assertReleaseDeployment,
  assertReleaseFiles,
  isReleasePromoted,
  verifiedDeploymentOrigin,
} from "../src/domain/deployment/release-policy";
import type { ReleaseTarget } from "../src/domain/deployment/release-policy";

const target = JSON.parse(
  readFileSync(
    new URL("../config/release-target.json", import.meta.url),
    "utf8",
  ),
) as ReleaseTarget;
const sha = process.env.GITHUB_SHA ?? "";
const mode = process.argv[2];
function vercel(args: Array<string>) {
  return execFileSync(
    process.platform === "win32" ? "vercel.exe" : "vercel",
    args,
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
      env: {
        ...process.env,
        VERCEL_ORG_ID: target.orgId,
        VERCEL_PROJECT_ID: target.projectId,
      },
    },
  );
}
async function vercelApi<T>(path: string, method = "GET"): Promise<T> {
  const url = new URL(path, "https://api.vercel.com");
  url.searchParams.set("teamId", target.orgId);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(method === "POST" ? { body: "{}" } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Vercel project request failed.");
  const body = await response.text();
  return (body ? JSON.parse(body) : null) as T;
}
try {
  if (
    !process.env.VERCEL_TOKEN ||
    process.env.GITHUB_REPOSITORY !==
      `${target.repoOwner}/${target.repoName}` ||
    process.env.GITHUB_REF !== `refs/heads/${target.branch}` ||
    !/^[a-f0-9]{40}$/.test(sha)
  )
    throw new Error(
      "Run this release from the reviewed main branch and configure the protected production environment.",
    );
  if (mode === "project") {
    const project = await vercelApi<{
      id?: string;
      accountId?: string;
      name?: string;
      buildCommand?: string;
      autoExposeSystemEnvs?: boolean;
      rollingRelease?: unknown;
      link?: {
        org?: string;
        repo?: string;
        productionBranch?: string;
        deployHooks?: Array<{ ref?: string }>;
      };
    }>(`/v9/projects/${target.projectId}`);
    if (
      project.id !== target.projectId ||
      project.accountId !== target.orgId ||
      project.name !== target.projectName ||
      project.link?.org !== target.repoOwner ||
      project.link.repo !== target.repoName ||
      project.link.productionBranch !== target.branch ||
      !project.autoExposeSystemEnvs ||
      project.rollingRelease ||
      project.buildCommand !== "bun run build"
    )
      throw new Error(
        "Project target or release settings differ. Complete the documented cutover before releasing.",
      );
    const config = JSON.parse(
      readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
    );
    if (
      config.git?.deploymentEnabled?.[target.branch] !== false ||
      config.buildCommand !== "bun run build"
    )
      throw new Error(
        "Automatic production Git deployments must be disabled and builds must not migrate.",
      );
    if (
      !Array.isArray(project.link.deployHooks) ||
      project.link.deployHooks.some(
        (hook) =>
          hook.ref === target.branch ||
          hook.ref === `refs/heads/${target.branch}`,
      )
    )
      throw new Error("An independent production deploy hook must be retired.");
    const inputs = JSON.parse(
      vercel(["deploy", "--dry", "--json", "--prod", "--non-interactive"]),
    ) as { files: Array<{ path: string }> };
    assertReleaseFiles(inputs.files);
    console.log(
      "Verified Carve production project and build-only release configuration.",
    );
  } else if (["deployment", "smoke", "promote"].includes(mode ?? "")) {
    const origin = verifiedDeploymentOrigin(process.env.DEPLOYMENT_URL ?? "");
    const deployment = await vercelApi<
      Parameters<typeof assertReleaseDeployment>[0] & { id?: string }
    >(`/v13/deployments/${new URL(origin).hostname}`);
    assertReleaseDeployment(deployment, target, sha, origin);
    if (mode === "smoke") {
      for (const [path, expected] of [
        ["/health", "Service available"],
        ["/sign-in", "Sign in to Carve"],
      ]) {
        const body = vercel([
          "curl",
          `${origin}${path}`,
          "--",
          "--fail",
          "--silent",
          "--show-error",
          "--max-time",
          "30",
          "--max-redirs",
          "0",
        ]);
        if (!body.includes(expected!))
          throw new Error("Read-only application smoke check failed.");
      }
    }
    if (mode === "promote") {
      if (!deployment.id || !/^dpl_[a-zA-Z0-9]+$/.test(deployment.id))
        throw new Error("A verified deployment ID is required for promotion.");
      await vercelApi(
        `/v10/projects/${target.projectId}/promote/${deployment.id}`,
        "POST",
      );
      let promoted = false;
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        const project = await vercelApi<
          Parameters<typeof isReleasePromoted>[0]
        >(`/v9/projects/${target.projectId}`);
        if (isReleasePromoted(project, target, deployment.id)) {
          promoted = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      if (!promoted)
        throw new Error("Production alias promotion did not finish in time.");
    }
    console.log(
      mode === "promote"
        ? "Verified production alias promotion to the tested deployment."
        : mode === "smoke"
          ? "Verified deployment identity, database health, and sign-in rendering."
          : "Verified staged production deployment belongs to the tested commit.",
    );
  } else
    throw new Error(
      "Choose project, deployment, smoke, or promote verification.",
    );
} catch {
  // Never dump API responses, protected pages, or subprocess output to CI logs.
  console.error(
    "Release step failed. Check the approved project, commit, build settings, credentials, staged deployment health, and promotion status before retrying. No later release steps will run.",
  );
  process.exitCode = 1;
}
