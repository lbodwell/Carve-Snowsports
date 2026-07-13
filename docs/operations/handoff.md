# Carve production rebuild handoff

Last updated: 2026-07-12

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

## Next session: implement the import pipeline

The immediate priority is **step 4 below** — the 2025–26 CSV import pipeline
described in `docs/plan.md` (PR 11). **Do not start implementation until
representative redacted source rows and field dictionaries are available.**

### Prerequisites before coding

- Redacted registration export samples and a field dictionary for the known
  2025–26 headers.
- Decisions on identity matching, attendance value semantics, product-date
  mapping, and column-to-lesson-date mappings for attendance columns.

### Suggested implementation order (once samples exist)

1. **Upload and staging** — import batch tables, file hash, adapter version,
   structural validation; no domain-table writes on parse failure.
2. **Normalize and preview** — canonical staging DTOs with row/column provenance;
   persisted no-write reconciliation summary.
3. **Matching and ambiguity queue** — deterministic keys first; human review for
   uncertain person matches (no silent fuzzy match).
4. **Idempotent apply** — transactional chunks; protect Carve-owned fields;
   downloadable error export.
5. **Tests** — golden files, integration apply tests, load test on representative
   file size.

### Key references

- Plan sequence: `docs/plan.md` → “PR 11 — Production import apply and reconciliation”
- Import contract: `docs/imports/` (when populated) and `docs/plan.md` → “Known legacy registration source”
- Domain preview slice: `src/domain/imports/` (header detection exists; not wired to upload)

## Current status

### Foundation and CI

- TanStack Start, React, Tailwind/shadcn, Bun, Vitest, Playwright, ESLint, and
  Prettier.
- GitHub Actions CI: format, lint, typecheck, unit tests, integration tests
  (migrations against disposable `carve_test`), E2E smoke, and production build.
- Local Postgres via Docker on port 5433; **eleven** Drizzle migrations; idempotent
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
  are configured; otherwise messages log to the console in development.
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

**Not started / prototype only** ← **next session (after samples)**

- `/demo` — database connectivity smoke route only.
- CSV import: header validation and no-write preview in domain code only; no
  upload, staging, matching, or apply pipeline.
- No Neon/Vercel projects, production secrets, observability, backup restore
  evidence, or cutover rehearsal.

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

| Route                          | Purpose                         |
| ------------------------------ | ------------------------------- |
| `/sign-in`                     | Staff authentication            |
| `/admin`                       | Season operations overview      |
| `/admin/seasons`               | Seasons and programs            |
| `/admin/programs/$programId`   | Program configuration           |
| `/admin/students`              | Student roster                  |
| `/admin/audit`                 | Roster-wide audit search        |
| `/admin/instructors`           | Instructor roster               |
| `/admin/staff`                 | Staff invitations (admin)       |
| `/accept-invitation/$id`       | Accept a staff invitation       |
| `/lessons`                     | Instructor lesson schedule      |
| `/lessons/$lessonInstanceId`   | Instructor lesson roster        |
| `/grouping`                    | Grouping draft workspace        |

`/demo` remains a small Postgres connectivity example. If port 3001 is busy,
Vite picks the next available port.

Cleanup:

```bash
bun run db:down
```

Use `docker compose down -v` only when intentionally deleting local database
data.

## Recommended next steps

Work in this order unless product input changes priorities.

### 1. Implement the import pipeline ← **start here**

- Obtain redacted source rows and field dictionaries for the 2025–26 export.
- Define identity, attendance, and date-mapping semantics.
- Build staged upload, row validation, reconciliation preview, ambiguity review,
  idempotent apply, and error exports.

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

## Verification

Last full local verification: 2026-07-12 (unit, integration, typecheck, lint,
build).

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test              # 27 unit tests
bun run test:integration  # 17 integration tests, 6 files
bun run test:e2e
bun run build
```

Integration tests apply all **eleven** migrations to a fresh `carve_test` database.
E2E runs against Postgres on isolated port 3101 with seeded admin sign-in.

Re-run the full suite after schema, auth, grouping, import, or E2E changes.
