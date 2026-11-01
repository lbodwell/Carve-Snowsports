# Preview deployments and schema readiness

Vercel continues to create Preview builds for branch commits. A Preview build now
checks its migration journal against the existing isolated Preview database before
Vite builds the application. It waits up to twelve minutes for pending migrations
and fails with an actionable message if the schema never becomes ready. It never
runs migrations itself. Production and local builds skip this check.

For an open same-repository PR targeting `main`, `ci.yml` runs quality checks and
then runs the same composite migration action as the existing `preview-migrations.yml`
workflow. Both jobs use the
`preview` environment's direct database secret and expected host/name, applies
migrations under the existing lock, and records a GitHub check. Failed quality
checks prevent migrations. Fork PRs do not receive the migration job. No
`pull_request_target` workflow or production credentials are used.

The migration job checks the PR merge commit tested by CI. The Vercel branch build
independently checks its own committed migrations, so it cannot become ready merely
because a different commit passed CI.

## Existing configuration

Connect `carve-preview-postgres` to Preview only and `carve-snowsports-postgres`
to Production only. The production resource previously also targeted Preview with
"Create Database Branch For Deployment" enabled. Its deployment action injected
a fresh production-derived branch into Preview builds, overriding the separate
Preview connection even though the project-level Preview variables came from the
correct store. GitHub migrated the shared Preview database while the application
used an unmigrated branch. Removing Preview from the production resource's project
connection fixes the override. Existing deployments retain their previous settings;
redeploy a Preview after correcting the connection scopes.

Keep `main` in the Preview environment's allowed deployment branches and add the
branch rule `refs/pull/*/merge`. GitHub matches PR workflows against that merge ref,
not the source branch name. Leave Production's main-only rule and approval gate
unchanged. The same-repository/main-target checks also exist in both workflows.

Preview still requires only `DATABASE_URL_UNPOOLED` and the nonsecret
`RELEASE_DATABASE_HOST`/`RELEASE_DATABASE_NAME` variables in GitHub. Vercel supplies
the Preview app's existing `DATABASE_URL`. No additional Vercel token or database
is needed. The checked-in `config/preview-database.json` pins the existing Preview
endpoint and database name; both the migration runner and build readiness check
reject other targets. Update it deliberately if that endpoint is replaced.

Open a PR when introducing migrations. A branch with no PR still builds normally
when its schema is already available; otherwise its build waits and then fails.
After opening a PR or fixing failed CI, redeploy a timed-out Preview in Vercel.
Manual **Preview database migrations** from `main` remains available for recovery.

## Synthetic demo setup

The dedicated Preview database uses synthetic demo data, rather than production
children, guardians, staff passwords, or survey answers. The fixture provides 27
students, six instructors, both disciplines, weekend 9 a.m./10 a.m./PM/full-day
slots, and separate Thursday/Friday 9:30–11 a.m. cohorts. Groups can be generated
and edited normally. Its login is `admin@carve.local`, with a generated password
stored in the Preview environment's `PREVIEW_DEMO_PASSWORD` secret.

To populate an empty Preview, run **Preview database migrations** from main with
`seed_demo` selected. Initial setup can also set the Preview environment variable
`PREVIEW_SEED_DEMO=true` for one passing PR CI run; clear that flag afterward.
Seeding verifies the pinned Preview endpoint, uses the migration lock, refuses
databases containing other organizations, and requires a strong Preview-only
password. Once the fixture exists, repeated runs preserve the roster and login.
Seeding is never part of Vercel builds or production releases.

## Shared database limits

Preview uses one shared database. New migrations must remain additive and compatible
with other running previews. A matching migration prefix allows older previews to
continue building after newer migrations have been applied. This exception applies
only to Preview; Production keeps its strict release history validation.

Two PRs that introduce different SQL at the same migration position cannot both
migrate this shared database. The second fails explicitly; rebase and reconcile
migration history without rewriting already-applied SQL. Never reset or roll back
the shared database as part of a branch build. Fully independent incompatible
schemas would require separate per-PR databases.

GitHub serializes Preview migration jobs without canceling an active migration.
The database advisory lock also protects manual/CI invocations. A failed
migration prevents the waiting build from publishing against the missing schema.

References: [GitHub environment branch matching](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
and [Vite asynchronous configuration](https://vite.dev/config/#async-config).
