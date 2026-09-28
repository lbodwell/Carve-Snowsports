# Deploy Carve to Vercel

This is the operator guide for putting the production rebuild on Vercel so
Pleasant Mountain staff can beta-test it. It assumes a Windows machine with
Bun, Docker (for local verification), and access to the GitHub repo.

Carve is a TanStack Start / Nitro app. Vercel hosts the app. Neon hosts
Postgres. Resend sends staff invitation and password-reset email. Vercel Blob
and Vercel Workflows are required only for `/admin/imports`.

Two tracks exist. Do not mix them.

| Track                   | Who                                   | Data                              | Ready now?                                               |
| ----------------------- | ------------------------------------- | --------------------------------- | -------------------------------------------------------- |
| **A. Synthetic beta**   | Internal staff testers                | Seeded demo org and fake students | Yes, after the setup below                               |
| **B. Operational beta** | Coordinators using real registrations | Real child / guardian data        | **No** — see [Gaps to close first](#gaps-to-close-first) |

Track A is the correct first deploy. Track B is a cutover, not a hosting
exercise. Follow `docs/operations/release-runbook.md` and
`docs/security/baseline.md` before loading real data.

## What the repo now does for deploy

These are implemented. Do not re-do them as code work:

- Vercel builds (`VERCEL=1` or `NITRO_PRESET=vercel`) use
  `nitro({ preset: "vercel", vercel: { entryFormat: "node" } })`. Local and CI
  builds stay on the default Nitro preset. Verify with `bun run build:vercel`.
- Preview deployments rewrite `APP_ORIGIN` / `BETTER_AUTH_URL` from
  `VERCEL_URL` and trust the production origin plus the Preview host.
- Production email is fail-closed. Missing `RESEND_API_KEY` / `EMAIL_FROM`
  refuses invitations and password resets instead of dropping mail.
- `/demo` is removed.
- `/health` pings Postgres. A down database fails the page instead of
  returning a false green.
- `bun run db:bootstrap` creates one organization, one admin, and the
  pre-lesson survey. It refuses the demo org name and `admin@carve.local`.

## Remaining gaps

### Still required from you before testers sign in

1. **Apply migrations yourself.** `vite build` does not run Drizzle. Use the
   Neon **direct** URL with `bun run db:migrate`.
2. **Bootstrap the empty database.** Track A may use `bun run db:seed`
   (synthetic students). Track B must use `bun run db:bootstrap` and never
   seed.
3. **Configure Resend** on the Production environment. Invites will now fail
   loudly if you skip this.

### Blockers for real data (Track B) — do not skip

1. **Data-policy gate is still open.** Retention, deletion, access-review, and
   incident-response policies are required before real child data
   (`docs/security/baseline.md`).
2. **Import apply auto-creates people** from Aspenware names with no identity
   review queue. Wrong matches become working roster records.
3. **Import files still travel through server functions**, not direct
   browser-to-Blob uploads. Large exports can hit Vercel body / timeout limits.
4. **Apply is a synchronous call**, not a durable workflow approval step.
5. **No error tracking** (Sentry or similar). Production mail/import failures
   that escape fail-closed checks still live in Vercel function logs.
6. **Instructor attendance / notes / substitutions are not persisted.**
   `/lessons/today` is still a local-state prototype.

### Not required to boot the app

Vercel Blob, `BLOB_READ_WRITE_TOKEN`, and Vercel Workflows are **not**
required for sign-in, invitations, grouping, surveys, or lesson reads. They
are required the first time someone uses `/admin/imports`.

## Accounts and services

Create these before touching Vercel env vars.

### 1. Neon Postgres

1. Create a Neon project in `us-east-1` (or the region closest to Vercel).
2. Create two databases or two branches:
   - `carve` production branch
   - optional `carve-preview` branch if you will use Preview deployments
3. Copy **both** connection strings:
   - **Pooled** (`-pooler`) — use this as Vercel `DATABASE_URL`. The app
     already sets `prepare: false` in `src/db/client.server.ts`.
   - **Direct** (no pooler) — use this only on your laptop for
     `bun run db:migrate`.
4. Enable **PITR / backups** on the production branch and write down how to
   restore. The release runbook requires a documented restore point before
   cutover.

### 2. Resend

1. Create a Resend account.
2. Verify a sending domain you control (`carve.pleasantmountain.com` or
   similar). Do not send production invites from `onboarding@resend.dev`
   once testers are outside your own inbox.
3. Create an API key with send permission only.
4. Choose `EMAIL_FROM` as a real address on that domain, for example
   `Carve <ops@carve.pleasantmountain.com>`. The env schema requires a valid
   email; if you include a display name, confirm the parser accepts it. The
   safest first value is a bare address: `ops@your-domain.com`.

### 3. Vercel

1. Import the GitHub repo (Framework Preset should read **TanStack Start**).
2. Use Bun as the install tool (`packageManager` is `bun@1.3.9`).
3. Confirm suggested settings:
   - Install: `bun install --frozen-lockfile`
   - Build: `bun run build`
   - Output: leave default (Nitro / TanStack Start detection)
4. Enable **Vercel Blob** on the project (private store) if testers will
   upload imports.
5. Enable **Vercel Workflows** on the project if testers will upload imports.
6. Add a Production domain. Prefer a stable hostname
   (`carve.pleasantmountain.com`) over the raw `*.vercel.app` URL so auth
   cookies and invite links stay stable.

Do **not** enable Vercel Deployment Protection in front of
`/accept-invitation/*` or `/surveys/*` if testers or parents need those
links without a Vercel SSO bypass.

## Environment variables

Set these on the Vercel project. Production and Preview must be different
if Preview URLs differ from Production.

| Name                         | Production                                          | Preview                              | Required to boot?                            |
| ---------------------------- | --------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `DATABASE_URL`               | Neon **pooled** URL + `?sslmode=require`            | Preview branch pooled URL            | Yes                                          |
| `BETTER_AUTH_SECRET`         | 32+ random characters, unique per environment       | Different secret                     | Yes                                          |
| `BETTER_AUTH_URL`            | `https://carve.your-domain.com` (no trailing slash) | That Preview origin, or skip Preview | Yes                                          |
| `APP_ORIGIN`                 | Same value as `BETTER_AUTH_URL`                     | Same as Preview `BETTER_AUTH_URL`    | Yes                                          |
| `RESEND_API_KEY`             | Resend API key                                      | Same or a test key                   | Needed to invite testers                     |
| `EMAIL_FROM`                 | Verified sender                                     | Same                                 | Needed to invite testers                     |
| `LOG_LEVEL`                  | `info`                                              | `info` or `debug`                    | No                                           |
| `DEV_IMPERSONATE_USER_EMAIL` | **unset**                                           | **unset**                            | Dev-only; ignored when `NODE_ENV=production` |
| `DEV_ADMIN_PASSWORD`         | Do not set on Vercel                                | Do not set                           | Seed/e2e only                                |
| `BLOB_READ_WRITE_TOKEN`      | Usually omit on Vercel (OIDC)                       | Omit                                 | Imports only; local Blob testing             |

Generate the auth secret locally:

```powershell
bun -e "console.log(crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''))"
```

`TEST_DATABASE_URL` is local/CI only. Never point it at Neon.

## Database: migrate, then bootstrap

Run this from your laptop against the Neon **direct** URL. Do not run
`db:migrate` as a Vercel build step.

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@ep-....neon.tech/carve?sslmode=require"
bun run db:migrate
```

Confirm 15 migrations applied (`0000`–`0014`).

### Track A bootstrap (synthetic beta)

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@ep-....neon.tech/carve?sslmode=require"
$env:DEV_ADMIN_PASSWORD = "<long random password, not carve-local-admin>"
bun run db:seed
```

This creates:

- Organization `Carve Demo Ski School`
- Season `Winter 2026`, program `Weekend Snowsports`, default configuration
- Synthetic students and one instructor
- Survey slug `pre-lesson` (anonymous submissions allowed)
- Admin `admin@carve.local` with `DEV_ADMIN_PASSWORD`

Treat that password as a secret. Invite real testers as themselves; do not
share `admin@carve.local` widely.

### Track B bootstrap (real organization, no fake students)

Do **not** run `db:seed` against a database that will hold real children.

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@ep-....neon.tech/carve?sslmode=require"
$env:BOOTSTRAP_ORGANIZATION_NAME = "Pleasant Mountain Snowsports"
$env:BOOTSTRAP_ADMIN_EMAIL = "ops@pleasantmountain.com"
$env:BOOTSTRAP_ADMIN_NAME = "School Admin"
$env:BOOTSTRAP_ADMIN_PASSWORD = "<at least 12 characters, unique>"
$env:BOOTSTRAP_TIMEZONE = "America/New_York"
$env:CONFIRM_PRODUCTION_BOOTSTRAP = "yes"
bun run db:bootstrap
```

This creates only the organization, one admin credential, and the open
`pre-lesson` survey. Re-run with `BOOTSTRAP_ALLOW_EXISTING=yes` to attach
another admin or with `BOOTSTRAP_RESET_ADMIN_PASSWORD=yes` to rotate the
password. It refuses `Carve Demo Ski School` and `@carve.local` addresses.

## Deploy

1. Push this branch and import the repo on Vercel (TanStack Start + Bun).
2. Confirm Vercel env vars are saved for Production. Preview deployments
   reuse those values but rewrite the public origin from `VERCEL_URL`.
3. Trigger the Production deployment.
4. Wait for the build. First failure modes:
   - missing required env → server module throws on boot
   - Neon not migrated → `/health` fails
5. Visit `https://<host>/health`. You should see `Service available`. That
   now also means Postgres accepted `select 1`.

## Post-deploy verification

Do these in order before inviting anyone else.

1. **Sign in** as the seeded admin at `/sign-in`.
2. Open `/admin`. You should see the demo season / roster summary.
3. Open `/admin/staff` and send an invitation to **your own real inbox**.
4. Confirm the Resend dashboard shows a delivered message and the link host
   is `APP_ORIGIN`.
5. Accept the invite in a private window. You should land on the role home
   (`/admin` or `/lessons`).
6. Reset password from `/forgot-password` to the same inbox.
7. Open `/surveys/pre-lesson` and submit a fake response.
8. Open `/admin/surveys` and confirm the response appears.
9. Create a grouping draft on `/grouping`, submit it, and confirm audit
   history on a student.
10. If testers will import: upload a **small redacted** listing CSV on
    `/admin/imports` and confirm the workflow run appears in Vercel.

If step 3 errors instead of creating an invite, production mail is not
configured. Fix `RESEND_API_KEY` and `EMAIL_FROM` before inviting testers.

## Inviting beta testers

1. Use `/admin/staff`. Roles:
   - `admin` — full staff administration, invitations, approve/publish
   - `coordinator` — seasons, people, grouping edit, imports
   - `instructor` — `/lessons` only
2. Tell testers:
   - this is a beta on synthetic data unless you have explicitly said otherwise
   - they must use the emailed accept link within seven days
   - public sign-up does not exist
   - survey links can be copied from `/admin/surveys` (survey email is not sent)
3. Do not upload live Aspenware exports until Track B gaps are closed.

## What testers can exercise today

Works on Track A after the steps above:

- Sign-in, invite, accept, forgot/reset password
- Season / program configuration
- Student and instructor rosters, archive, audit search
- Grouping generate → adjust → submit → approve → publish
- Instructor lesson schedule and need-to-know roster (after linking
  `instructors.user_id` to the staff user)
- Public pre-lesson survey and admin survey inbox
- Import upload / reconcile / apply — **only with redacted files**, and only
  after Blob + Workflows are enabled

Does not work yet:

- Persisted attendance, lesson notes, substitutions
- Printable / CSV lesson export
- Identity-review import apply
- Microsoft Entra sign-in (`docs/security/entra-migration.md`)

## Rollback

- **App:** Vercel → Deployments → promote the previous Production deployment.
- **Schema:** Drizzle migrations in this repo are forward-only. Do not apply
  an unreviewed migration to production. Restore Neon PITR if a migration
  must be undone.
- **Bad import apply:** restore the pre-import Neon point. Applied people
  are real roster rows.

## Related docs

- `docs/operations/release-runbook.md` — cutover rehearsal and go/no-go
- `docs/operations/handoff.md` — current feature status and import hardening
- `docs/security/baseline.md` — data-policy gate
- `docs/architecture/overview.md` — Vercel + Neon topology
- `.env.example` — local template (do not copy localhost URLs to Vercel)
