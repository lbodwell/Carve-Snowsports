# Carve production rebuild handoff

Last updated: 2026-09-07

## Where we are

The production rebuild lives in the separate `carve-production` repository.
The original `carve` repository remains an untouched PoC/reference.

The app is a working local vertical slice: authenticated staff can invite users,
manage season/program setup and people rosters, run the full grouping workflow
(generate → adjust → submit → approve → publish), and instructors with linked
profiles can view assigned lesson schedules and need-to-know rosters. It is **not**
ready for real staff data, production deployment, or cutover.

Use this document to pick up implementation without re-discovering what is wired
today versus what remains from `docs/plan.md`.

## Next session: productionize the import pipeline

The immediate priority is end-to-end validation and production configuration of
the Aspenware import workflow. `CustomerProductListing.csv` is required;
by-order and prompt exports are optional enrichments. The broad
`CustomerDetailFromProductWithDOB.csv` export is deliberately unsupported.

The current `/admin/imports` UI accepts individual CSVs or a ZIP. It validates
supported headers, preserves validated files in private import storage, and
starts a Vercel Workflow for asynchronous reconciliation. In production,
configure a private Vercel Blob store for Preview and Production, grant the
deployment Blob/OIDC access, and monitor import workflow runs in Vercel.
Uploaded source files are temporary private objects; do not copy them to
application logs, database JSON, or support tickets.

### Prerequisites before production use

- Redacted registration export samples and a field dictionary for the
  Aspenware report headers.
- Decisions on identity-match review, source status handling, and time-slot
  mapping for product session labels.
- A private Vercel Blob store, `BLOB_READ_WRITE_TOKEN` for non-Vercel/local
  execution, and the Vercel Workflow capability enabled for the project.
- A live Docker/Postgres environment for migration and integration-test
  verification. Docker Desktop was unavailable during the latest local run.

### Remaining import hardening

1. **Direct Blob uploads** — replace the current server-function transfer path
   with authenticated browser-to-Blob uploads before accepting large source
   files in production.
2. **Identity review** — add a human ambiguity queue for unbound people; do not
   introduce name-only auto-matching.
3. **Workflow approval** — make Apply signal a durable workflow approval step,
   rather than relying on a synchronous apply call.
4. **Operational verification** — run migration, import integration, ZIP, and
   browser tests against representative redacted files; configure raw-file
   retention cleanup.

### Key references

- Plan sequence: `docs/plan.md` → “PR 11 — Production import apply and reconciliation”
- Import contract: `docs/imports/` (when populated) and `docs/plan.md` → “Known legacy registration source”
- Import domain and upload validation: `src/domain/imports/`
- Import application service: `src/application/services/registration-import-service.server.ts`
- Workflow entry point: `src/workflows/aspenware-import.ts`

## Current status

### Foundation and CI

- TanStack Start, React, Tailwind/shadcn, Bun, Vitest, Playwright, ESLint, and
  Prettier.
- GitHub Actions CI: format, lint, typecheck, unit tests, integration tests
  (migrations against disposable `carve_test`), E2E smoke, and production build.
- Local Postgres via Docker on port 5433; **fourteen** Drizzle migrations; idempotent
  seed in `src/db/seed.ts`.
- Vitest unit project uses `DATABASE_URL=carve`; integration project overrides
  both `DATABASE_URL` and `TEST_DATABASE_URL` to `carve_test` and runs test
  files sequentially (`vitest.config.ts`).

### Authentication and authorization

**Done**

- Better Auth with invite-only sign-up disabled (`disableSignUp: true`).
- Staff sign-in at `/sign-in`; forgot/reset password at `/forgot-password` and
  `/reset-password`.
- Session guards on `/admin` and `/grouping` via `getStaffSession`.
- Server-side actor resolution in `src/server/auth/resolve-actor.server.ts`
  (Better Auth session + organization membership; optional dev impersonation
  via `DEV_IMPERSONATE_USER_EMAIL`, ignored in production).
- Application-layer `requirePermission` checks on write paths.
- Staff invitation create/accept at `/admin/staff` and
  `/accept-invitation/$invitationId`.
- Role-aware navigation and route guards: instructors land on `/lessons`;
  coordinators/admins see permission-filtered admin navigation.
- Production email delivery via Resend when `RESEND_API_KEY` and `EMAIL_FROM`
  are configured. Development logs messages to the console. Production
  refuses invitations and password resets if mail is not configured.
- Role-specific sensitive-field projections on student roster/detail, grouping
  roster reads, and instructor lesson rosters via
  `src/application/policies/sensitive-field-projection.ts`.
- Authorization integration tests in `tests/integration/authorization.test.ts`.

**Deferred**

- Linking seeded demo instructors to staff user accounts in `db:seed` (manual
  `instructors.user_id` update required for local instructor lesson testing).

Local admin: `admin@carve.local` / `DEV_ADMIN_PASSWORD` (default
`carve-local-admin`), seeded by `bun run db:seed`.

### Season and program administration

**Done**

- `/admin/seasons` — create/edit seasons (name, dates, status); create/edit
  programs; view configuration counts.
- `/admin/programs/$programId` — edit disciplines, ability levels, age bands,
  and time slots (create, update, activate/deactivate; no hard deletes).
- New programs receive default configuration (ski/snowboard, six levels, two age
  bands, AM/PM slots) matching the seed pattern.
- Services: `season-service.server.ts`, `program-service.server.ts`,
  `program-configuration-service.server.ts`.
- Server functions: `season-program.ts`, `program-configuration.ts`.
- Requires `program:manage` (admin and coordinator roles).

**Not done**

- Audit-history UI for season/program/configuration changes (events are written).
- Calendar recurrences and excluded dates UI.
- Rule-set version administration.

### People administration

**Done**

- `/admin` — organization/season/program overview and roster readiness summary.
- `/admin/students` — roster list, registration actions, links to detail/create.
- `/admin/students/new` and `/admin/students/$studentId` — create, edit,
  register, archive with guardian/contact/support fields and audit events.
- `/admin/instructors` — create, edit, qualify, contact, notes, archive.
- `/admin/audit` — organization-scoped roster audit search (students,
  instructors, registrations) with subject labels and links to student detail.
- Authorized, organization-scoped services:
  `student-roster-service.server.ts`, `instructor-service.server.ts`,
  `audit-history-service.server.ts` (`searchRosterAuditHistory`).
- Server functions: `student-roster.ts`, `admin-roster.ts`, `instructors.ts`,
  `audit-history.ts`.
- Per-record audit-history panels on student detail and instructor edit views.
- People write integration tests in `tests/integration/people-writes.test.ts`.
- Roster audit search integration tests in
  `tests/integration/audit-search.test.ts`.

**Not done**

- Cross-entity audit search beyond roster records (e.g. grouping, season/program).

### Grouping (full draft workflow)

**Done**

- `/grouping` — persisted workspace with optimistic version checks and
  workflow actions (submit, approve, publish).
- **Auto-draft on create** — `grouping-snapshot.server.ts` builds a program
  snapshot; `generateGroupingDraft` persists proposed groups, assignments,
  instructors, and unplaced reasons (stored in draft-creation audit metadata).
- Manual adjustments: CRUD groups, move registrations, assign instructors (with
  lead), overlap and qualification validation.
- **Compensating undo** for the latest `move_registration` via
  `undoDraftOperation` and stored `draft_operations` payloads.
- **Submit / approve** — `editing` → `submitted` → `approved` with audit events;
  `grouping:edit` for submit, `grouping:approve` for approval.
- **Publication** — idempotent transactional publish in
  `grouping-publication-service.server.ts`: stable `season_groups` numbers,
  `group_revisions`, `group_recurrences`, `group_revision_memberships`, and
  `lesson_instances` from `generateLessonCalendar`.
- Services: `grouping-draft-service.server.ts`,
  `grouping-publication-service.server.ts`; server functions in
  `grouping-draft.ts`.
- Integration tests in `tests/integration/grouping-workflow.test.ts`.
- E2E smoke covers draft creation, submit, and audit page load.

**Not done**

- Version-conflict recovery UI beyond server error messages.
- Undo for non-move operations (assign instructor, update/delete group).
- Dedicated `grouping_draft_warnings` table (warnings live in audit metadata and
  group notes).
- E2E coverage for approve → publish and lesson-instance verification.
- Calendar excluded-dates UI affecting lesson generation.

### Lessons (instructor reads)

**Done**

- `/lessons` — instructor schedule (lead-assigned lesson instances).
- `/lessons/$lessonInstanceId` — need-to-know roster via
  `projectInstructorLessonStudent`.
- Service: `lesson-service.server.ts`; server functions in `lessons.ts`.
- Instructor resolved via `instructors.user_id`; lesson access scoped to lead
  assignments only.
- Integration tests in `tests/integration/lesson-authorization.test.ts`.

**Not done** ← **PR 10**

- Attendance recording, lesson notes, instructor substitutions.
- `/lessons/today` prototype remains local-state only (no Postgres).
- Printable rosters and CSV export.

### Imports, and production ops

**Implemented locally; production hardening remains**

- `/admin/imports` — authorized upload of individual CSVs or a ZIP, header-based
  role validation, required listing enforcement, and asynchronous status polling.
- `src/domain/imports/aspenware-upload.ts` validates CSV roles; ZIP expansion
  rejects encrypted archives, unsafe paths, duplicate roles, and oversized files.
- Import batches/files/rows, source fingerprints, and purchaser parties are
  persisted. Vercel Workflow reconciliation is started with a batch ID only.
- Private import storage uses Vercel Blob when deployed and a local private
  directory during development.
- Remaining: direct-to-Blob client uploads, durable approval/cancellation,
  import integration/E2E tests, retention sweep, deployment observability, and
  production secrets/cutover rehearsal.

### Domain and tests

- Pure domain: calendar/time-range, grouping engine (benchmarked at 500
  registrations), draft operations, seasonal CSV preview.
- **27** unit tests, **17** integration tests (6 files: migrations,
  authorization, people-writes, grouping-workflow, lesson-authorization,
  audit-search).
- E2E smoke (port 3101): `/health`, sign-in, admin overview, students,
  instructors, seasons, program configuration, grouping submit, roster audit page.
- Install Chromium once on a new machine: `bunx playwright install chromium`.

## Try it locally

```bash
cd C:\Users\lukeb\Dev\Carve\carve-production
bun install
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
```

Primary staff routes:

| Route                        | Purpose                        |
| ---------------------------- | ------------------------------ |
| `/sign-in`                   | Staff authentication           |
| `/admin`                     | Season operations overview     |
| `/admin/seasons`             | Seasons and programs           |
| `/admin/programs/$programId` | Program configuration          |
| `/admin/students`            | Student roster                 |
| `/admin/audit`               | Roster-wide audit search       |
| `/admin/instructors`         | Instructor roster              |
| `/admin/staff`               | Staff invitations (admin)      |
| `/admin/imports`             | Aspenware import upload/status |
| `/accept-invitation/$id`     | Accept a staff invitation      |
| `/lessons`                   | Instructor lesson schedule     |
| `/lessons/$lessonInstanceId` | Instructor lesson roster       |
| `/grouping`                  | Grouping draft workspace       |

If port 3001 is busy, Vite picks the next available port.

Cleanup:

```bash
bun run db:down
```

Use `docker compose down -v` only when intentionally deleting local database
data.

## Recommended next steps

Work in this order unless product input changes priorities.

### 1. Harden the import pipeline ← **start here**

- Configure private Blob and Vercel Workflow in Preview/Production.
- Replace server-function file transfer with direct Blob uploads.
- Add manual identity review, durable approval/cancellation, and retention
  cleanup before processing real staff data.

### 2. Complete lesson operations for instructors (PR 10)

- Attendance recording, lesson notes, substitutions, print/export.
- Retire or wire `/lessons/today` to persisted lesson instances.

### 3. Grouping and people polish

- Version-conflict recovery UI; broader undo coverage.
- Optional audit search across grouping and season/program events.
- Seed a demo instructor user linked to `instructors.user_id` for local testing.

### 4. Production readiness

- Provision Neon and Vercel; configure secrets and preview/production URLs.
- Add observability, backup/PITR restore evidence, security/data-policy review,
  staff acceptance testing, and two full cutover rehearsals.

## Important technical notes

- Database client: `postgres` / `drizzle-orm/postgres-js` (works with local
  Docker and Neon TCP).
- Database access belongs in TanStack server functions or `.server.ts` modules
  only.
- Environment template: `.env.example` (`.env.local` is gitignored). Optional
  production email: `RESEND_API_KEY`, `EMAIL_FROM`.
- Local database: `localhost:5433`, user/password/db `carve`/`carve`/`carve`.
- Integration tests require
  `TEST_DATABASE_URL=postgresql://carve:carve@localhost:5433/carve_test`,
  reject non-local targets, and set `DATABASE_URL` to the same `carve_test`
  database so application services under test hit the disposable DB.
- `src/routeTree.gen.ts` is excluded from Prettier.
- Synthetic seed data should remain for development; do not point this app at
  real child or contact data until auth, access control, and data-policy gates
  are complete.
- Server-function pattern: Zod-validated command → `resolveActor` → application
  service (`requirePermission`, transaction, audit event) → narrow view model.
- Publication must be one serializable transaction with idempotency support per
  `docs/plan.md`; do not publish by flipping draft status alone.
- Migration `0010` adds `group_revision_memberships` (student placements on
  published group revisions). Publication copies draft assignments into this
  table.
- Migrations `0011`–`0013` add multi-file import staging, registration source
  provenance/purchaser parties, and workflow/storage metadata.

## Verification

Latest local verification: 2026-09-07 (import unit tests, typecheck, lint, and
build). Integration and E2E tests were not run because Docker Desktop was not
available.

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run test:e2e
bun run build
```

Integration tests apply all **fourteen** migrations to a fresh `carve_test` database.
E2E runs against Postgres on isolated port 3101 with seeded admin sign-in.

Re-run the full suite after schema, auth, grouping, import, or E2E changes.
