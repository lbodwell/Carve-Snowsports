# Controlled production releases

The production release workflow is implemented locally in
`.github/workflows/production-release.yml`. It must be committed and pushed before
GitHub can run it. Resource provisioning and GitHub environment protections alone
do not activate the pipeline or release the application.

`.vercelignore` explicitly excludes local credentials, raw import exports, staged
uploads, Workflow histories, diagnostics, tests, and local build output. Git ignore
rules alone did not exclude these artifacts in the CLI deployment dry run.
Inspect `vercel deploy --dry --json` before changing these exclusions; never upload
the raw listing or private runtime state as application source.

## Provisioned resources

Vercel project: `carve-snowsports` (`prj_TAZY19fj8otsYtcLDu3usLdPuuoJ`),
team `lbodwells-projects` (`team_tzJQbGMsC7hkQtAo9nqHjlNQ`).

| Environment | Database                                                        | Private import storage                                |
| ----------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Production  | Existing `carve-snowsports-postgres` (`store_NxbZFwkDnecyzvXQ`) | `carve-imports-production` (`store_HeXhBOBIwhzMdwYy`) |
| Preview     | New `carve-preview-postgres` (`store_owcDfzA84Z8q9SLz`)         | `carve-imports-preview` (`store_DucwJ6ENNPg60ed2`)    |

The Preview database was provisioned empty. No hosted migrations, seed, or
bootstrap have been run as part of provisioning. Database variables, Blob tokens,
and Better Auth secrets have separate Production/Preview scopes; credentials are
Vercel sensitive Secrets. Existing Production credential values were preserved.
Development configuration was not replaced with Preview credentials.

Fluid compute and exposed system environment variables are enabled. The existing
Workflow SDK uses Vercel's managed backend; no separate queue, Redis, or worker
server needs provisioning. Actual hosted import execution still needs rehearsal.
Vercel reported no standalone deploy hooks during setup.

## GitHub environments and credentials

Use the existing **Production** environment (GitHub environment names are case
insensitive) and a separate **preview** environment. Restrict both to the branch
`main`, with no tag rules. Production requires `lbodwell` to approve, disables
administrator bypass, and permits self-review for the current solo operator.
These controls restrict release credentials; they do not protect the main branch
from code changes by authorized repository writers.

Enter credentials directly in GitHub's environment settings. Never put credential
values in chat, workflow YAML, repository variables, or logs. Use a Vercel token
scoped to the **carve-snowsports project** within `lbodwells-projects`, with an
expiration, and replace it before expiry. Create it in
[Vercel Account Tokens](https://vercel.com/account/tokens): drill into the team in
the Scope dropdown and choose the project. Team identifiers in the workflow still
select the owning team; they do not require a token covering every team project.
The migration connection must use the matching database's direct endpoint.

Keep `VERCEL_TOKEN` in the Production environment, not repository-level secrets:
repository secrets would allow other eligible workflows to use it without that
environment's approval gate. Preview does not need a Vercel token: the Git
integration deploys Preview, and its manual migration job only connects to Neon.

| GitHub environment | Environment secrets                                     | Environment variables (not secret)               |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| Production         | `VERCEL_TOKEN`, `DATABASE_URL_UNPOOLED`                 | `RELEASE_DATABASE_HOST`, `RELEASE_DATABASE_NAME` |
| preview            | `DATABASE_URL_UNPOOLED` from **carve-preview-postgres** | `RELEASE_DATABASE_HOST`, `RELEASE_DATABASE_NAME` |

Obtain the direct connection from the corresponding Neon resource's connection
panel. The host variable is the direct hostname only (no scheme or `-pooler`);
the name variable is the database name only. Check each environment independently.
The runner compares these expected values to the credential URL before connecting
and requires a Neon hostname and certificate-verified TLS. Do not reuse the
Production URL in Preview. No Blob token or application auth secret belongs in
GitHub: Vercel supplies those to the deployed application.

## Activate once credentials are ready

1. Review and commit the application, migrations, release scripts, workflows,
   `config/release-target.json`, and `vercel.json` together. Confirm local checks
   and the hosted Preview import rehearsal before the first production release.
2. Remove the legacy Vercel dashboard build override, replacing it with exactly
   `bun run build`. The existing override runs migrations and optional bootstrap
   during production builds. Do this as a coordinated cutover before pushing the
   release commit; do not trigger another legacy production build in between.
   The release preflight refuses to proceed until the dashboard command is clean.
   Remove obsolete bootstrap credentials/flags when no longer needed.
3. Push the reviewed commit to `main`. `vercel.json` disables automatic production
   Git deployments for `main` and enforces a build-only command. Preview Git
   deployments remain enabled. If a separate production deploy hook has since
   been created, retire it; release preflight blocks a hook targeting `main`.
4. Run **Preview database migrations** from `main` to prepare the new isolated
   database. Bootstrap an organization/admin separately if this is an empty
   environment; the migration workflow never seeds or creates admin credentials.
   Redeploy Preview after provisioning changes so the app receives the new values.
5. Run **Production release** from `main`. Wait for quality checks and inspect
   the exact commit and SQL before approving the Production environment gate.

Production release runs the reusable quality workflow against local Postgres:
format, lint, TypeScript, unit tests, fresh migrations, integration tests, and
production-build browser tests. Production credentials are scoped to release
steps after the environment gate; dependency installation has no release secrets.

The release then checks the intended Vercel project, migration target, and applied
history; remotely builds a staged Production deployment with `--skip-domain`;
verifies its project, team, ready state, and full tested commit SHA; applies
migrations; checks database health and sign-in rendering; and promotes that exact
deployment. Project and promotion API requests use explicit project/team IDs,
avoiding account-wide lookups that project-scoped tokens cannot perform. Promotion
uses the same Vercel endpoint as `vercel promote` and waits for successful alias
assignment and the expected Production target. Remote builds retain Vercel's
Workflow system configuration. Rolling releases require a separate design and are
rejected by this pipeline's preflight.
No production domain moves when an earlier step fails.

## Migration behavior and recovery

Generate SQL in development and review it in the release commit. Never edit an
already-applied SQL migration, run schema push, generate migrations in CI, seed
Production, or bootstrap as part of a normal build/release.

`bun run db:migrate:release --check` checks target and migration history without
applying DDL. `bun run db:migrate:release` uses the same checks, a session advisory
lock, a 10-second lock timeout, a 120-second statement timeout, and Drizzle's
transactional migration execution. Pending SQL and journal records roll back
together on failure. An overlapping release migration fails rather than waiting
indefinitely. GitHub also serializes release jobs without canceling active runs.
The advisory lock only coordinates this runner; prohibit concurrent manual
`drizzle-kit migrate` or schema editing, which would bypass it.

After a failed release, inspect the failed stage and the database state before
retrying. Re-running the same migration set is safe after a successful apply;
changed historical SQL and a checkout older than the database journal are rejected.
Logs intentionally omit raw driver errors, connection strings, and API responses.
Use restricted provider diagnostics when investigating failures.

Use additive schema changes compatible with the still-running old app and old
Workflow runs. A staged build does not stop existing users or workflows. A rename
or removal needs separate expand, backfill, and contract releases. Test SQL must
fit transactional execution; concurrent index creation needs a separately reviewed
operational plan rather than dropping it into this migration runner.

If migrations succeed but smoke checks fail, the old application stays live and
the expanded schema remains applied. Fix forward or promote a known compatible
application version. Application rollback never reverses schema changes. Verify
Neon backup/PITR and rehearse an isolated restore before real-data cutover.

The smoke checks are read-only and do not establish full import readiness.
Rehearse private browser upload, reconciliation, human review, apply, retry, and
survey matching against synthetic/redacted Preview data before live imports.

References: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration),
[Vercel CLI deployments](https://vercel.com/docs/cli/deploying-from-cli), and
[GitHub environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment).
