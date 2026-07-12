# Carve production rebuild handoff

Last updated: 2026-07-12

## Current status

The production rebuild lives in the separate `carve-production` repository.
The original `carve` repository remains an untouched PoC/reference.

The application now has a working local foundation:

- TanStack Start, React, Tailwind/shadcn, Bun, linting, formatting, Vitest,
  Playwright configuration, and GitHub Actions CI.
- Drizzle schema and generated migrations for organizations, programs, people,
  registrations, grouping drafts, lesson instances, attendance, import batches,
  audit events, and Better Auth tables.
- A local Postgres Docker container, migrations, and idempotent synthetic seed
  data.
- A database-backed demo route at `/demo`.
- Domain-level calendar, time-range, grouping, draft-operation, authorization,
  and CSV-preview tests.
- Better Auth endpoint wiring with invite-only password sign-up disabled.
- Prototype coordinator grouping and instructor attendance screens.

## Try it locally

```bash
cd C:\Users\lukeb\Dev\Carve\carve-production
bun install
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
```

The demo route is `/demo`. It shows five synthetic students loaded from
Postgres. If port 3001 is occupied, Vite selects the next available port.

Useful cleanup:

```bash
bun run db:down
```

Use `docker compose down -v` only when intentionally deleting local database
data.

## What is real today

- `src/routes/demo.tsx` calls the server function in
  `src/server/functions/demo.ts`, which queries Postgres.
- `src/db/seed.ts` creates the demo organization, season, program,
  configuration values, and five students. It is safe to rerun.
- `src/domain/grouping/engine.ts` is deterministic and benchmarked with 500
  registrations; it is pure domain code and has unit tests.
- `src/domain/imports/seasonal-registration-2025-26.ts` validates the known
  CSV header shape and produces a no-write preview with attendance/support
  provenance.

## What is deliberately not production-complete

Do not treat the current app as ready for staff or sensitive data.

- The `/grouping` and `/lessons/today` screens use local prototype data, not
  persisted records.
- The import adapter does not yet upload files, perform identity matching,
  persist staged rows, or apply records.
- Better Auth is mounted but there is no invitation UI, initial admin bootstrap,
  session guard, or complete role-aware navigation.
- Application services exist only for an initial season flow; most database
  writes do not yet use the planned server-function/application-service/audit
  path.
- Group draft persistence, approvals, atomic publication, generated lesson
  instances, substitution, and attendance persistence are not wired.
- No Neon project, Vercel project, production secrets, backup restore test, or
  cutover rehearsal exists.
- Browser E2E runs its Vite server on isolated port 3101 and has a passing
  `/health` and database-backed `/demo` smoke test. Install Chromium once with
  `bunx playwright install chromium` on a new development machine.

## Recommended next implementation sequence

1. **Stabilize local developer workflow**
   - Local development uses `carve`; integration tests recreate only the
     disposable local `carve_test` database.
   - Playwright has an isolated server lifecycle and a passing `/demo` smoke
     test.
   - `bun run test:integration` applies migrations against a clean
     `carve_test` database and verifies the resulting schema.

2. **Finish authentication and authorization**
   - Add an invitation/bootstrap-admin workflow.
   - Resolve session in the authenticated app layout.
   - Implement server-side organization/role guards and test them against
     anonymous, wrong-role, and wrong-organization requests.

3. **Ship one complete persisted vertical slice**
   - Create season/program configuration and student/guardian/registration
     CRUD through server functions.
   - Add audit events and role-specific projections in the same slice.
   - Replace the static demo view with server-backed feature screens.

4. **Wire the grouping workflow**
   - Persist drafts, groups, assignments, warnings, and operations.
   - Connect the deterministic engine to a snapshot and rule-set version.
   - Implement version-conflict handling, compensating undo, coordinator
     submission, admin approval, and transactional publication.

5. **Implement the import pipeline**
   - Obtain the promised redacted source rows and field dictionaries.
   - Define identity/attendance semantics and explicit date mappings.
   - Add staged upload, row-level validation, reconciliation preview,
     ambiguity review, idempotent application, and error exports.

6. **Production readiness**
   - Provision Neon and Vercel environments.
   - Complete observability, backup/PITR restore evidence, security/data
     policy, staff acceptance testing, and two full cutover rehearsals.

## Important technical notes

- The database client uses `postgres`/`drizzle-orm/postgres-js`, not the Neon
  WebSocket client. This allows the same code to work against local Docker
  Postgres and a normal Neon TCP connection.
- Database calls must be inside a TanStack server function or `.server.ts`
  module. Direct database imports in route components are blocked by TanStack
  Start's client import protection.
- `.env.local` is intentionally ignored. Its checked-in counterpart is
  `.env.example`.
- The current local database is `localhost:5433`, user/password/database
  `carve`/`carve`/`carve`. These values are development-only.
- Set `TEST_DATABASE_URL` to the same local Postgres instance with database
  name `carve_test`. The integration test rejects non-local URLs and any
  database name other than `carve_test`.
- Generated `src/routeTree.gen.ts` is excluded from Prettier because route
  generation and the Tailwind plugin format it differently.

## Verification completed

At the last full check:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

All passed. The grouping benchmark placed 500 synthetic registrations in about
4 ms in the local environment. The database-backed `/demo` route returned the
seeded roster successfully.
