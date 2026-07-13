---
name: Carve Production Rebuild
overview: Build a separate production Carve application around a season-first grouping model, with dated lesson instances, an explainable auto-draft workflow, PostgreSQL persistence, secure role-based access, and repeatable multi-file imports. TanStack Start remains the full-stack chassis; optimization and imports stay behind service interfaces so they can move to background compute only if measured runtime requires it.
todos:
  - id: discovery-contract
    content: Document terminology, launch journeys, data ownership, privacy policy, and versioned hard/soft grouping rules.
    status: completed
  - id: foundation
    content: Create the separate TanStack Start/Bun repository with Drizzle, Neon, CI/CD, environments, observability, and security baseline.
    status: in_progress
  - id: domain-data
    content: Implement and test the season-first schema, repositories, authorization services, audit model, and lesson generation.
    status: in_progress
  - id: grouping-engine
    content: Build and benchmark the deterministic explainable auto-draft engine behind a replaceable job interface.
    status: completed
  - id: ux-prototype
    content: Prototype and approve the non-technical group-builder, approval flow, instructor attendance view, print, and responsive/accessibility states.
    status: completed
  - id: core-workflows
    content: Implement roster administration, draft autosave/versioning, overrides, approval/publication, instances, attendance, and exports.
    status: in_progress
  - id: csv-pipeline
    content: Implement repeatable multi-file import, matching, reconciliation preview, idempotent apply, reporting, and load tests.
    status: in_progress
  - id: auth-rbac
    content: Ship invite-only Better Auth credentials and least-privilege RBAC, then document and test Entra account migration.
    status: in_progress
  - id: launch-readiness
    content: Complete automated verification, security/data-policy gates, two cutover rehearsals, rollback validation, and production runbooks.
    status: in_progress
isProject: false
---

# Carve Production Rebuild Plan

## Confirmed product and architecture decisions

- Create a separate repository; keep this PoC read-only as a behavioral reference.
- Use Bun, React, TanStack Start server functions, Tailwind/shadcn, Drizzle, Neon Postgres, and Vercel.
- Model one school initially while putting `organizationId` on tenant-owned records to avoid a future destructive tenancy migration.
- Make the season/program grouping the primary workflow. Groups recur weekly; publication generates dated lesson instances with holiday exclusions. Instances support roster exceptions, instructor substitutes, attendance, and notes.
- Auto-draft groups from configurable hard/soft rules. Ability level is a strongly weighted soft rule. Show unplaced students, scores, warnings, and reasons before publishing.
- Draft changes autosave with optimistic concurrency and audit history. Coordinators submit; administrators approve and publish. Leads are required at publication. Parallel groups receive immutable generated numbers; lead names are display context, not identity.
- Launch with invite-only Better Auth email/password and roles for admin, coordinator, and instructor. Preserve provider-neutral user identities so Entra can later link accounts by stable tenant/object IDs rather than mutable email.
- Treat repeatable multi-file CSV synchronization as a launch requirement. External reports own identity/registration fields; Carve owns grouping and operational fields.
- Desktop/laptop is primary for coordination. Instructors get a focused responsive view of their assignments, need-to-know safety/contact data, and basic attendance.

## Target architecture

- Keep route components thin and organize by feature: `students`, `instructors`, `seasons`, `grouping`, `lessons`, `imports`, and `admin`.
- Separate `domain` (pure rules/types), `application` (use cases and authorization), `db` (Drizzle repositories/transactions), `server` (server functions/routes), and `features` (UI). Do not recreate the monolithic state/mutation design in [src/lib/ski-school/context.tsx](src/lib/ski-school/context.tsx) or the responsibilities combined in [src/features/groups/group-builder.tsx](src/features/groups/group-builder.tsx).
- Port only verified concepts from [src/lib/ski-school/schedule.ts](src/lib/ski-school/schedule.ts), [src/lib/ski-school/placement.ts](src/lib/ski-school/placement.ts), and [src/lib/ski-school/schemas.ts](src/lib/ski-school/schemas.ts). Rewrite hard-coded age, slot, level, and urgency assumptions as configurable, tested domain policies.
- Use TanStack loaders/server functions for same-origin reads and mutations. Use server routes for auth callbacks, file upload/download, and print/export responses. Put grouping and import work behind job interfaces; benchmark representative files/datasets before deciding whether Vercel functions suffice or a durable worker/queue is warranted.
- Use server-authoritative transactions, idempotency keys for imports/publication, row versions for conflict detection, soft deletion where history matters, and an append-only audit trail.

## Concrete repository layout

```text
src/
  routes/
    __root.tsx
    _auth/                         # sign-in, reset, invitation acceptance
    _app.tsx                       # authenticated shell and role guard
    _app/seasons/
    _app/students/
    _app/instructors/
    _app/grouping/
    _app/lessons/
    _app/imports/
    api/auth/$.ts                  # Better Auth handler
    api/imports/$.ts               # uploads/downloads when server routes are needed
  features/
    seasons/
    people/
    grouping/
    lessons/
    imports/
    auth/
  domain/
    calendar/
    grouping/                      # rules, scores, engine DTOs; no React/DB imports
    attendance/
    imports/
  application/
    ports/                         # repository, clock, ID, job, storage interfaces
    services/                      # authorized use cases and transaction boundaries
    policies/                      # RBAC and sensitive-field projection
  server/
    auth/
    functions/                     # thin createServerFn adapters
    routes/
    observability/
  db/
    client.server.ts
    schema/
    repositories/
    migrations/
  components/ui/
  test/
    factories/
    fixtures/
    integration/
docs/
drizzle.config.ts
```

- Enforce dependency direction: routes/features may call server-function clients; server adapters call application services; services depend on ports and domain; repositories implement ports. Domain code imports neither Drizzle nor framework code.
- Use `.server.ts` modules for database, secrets, and privileged auth helpers. Add a CI check/build test that fails if server-only modules leak into the client bundle.
- Add TanStack Query for cached server state and mutation invalidation; keep durable state out of global React Context. Use route search parameters for shareable workspace selection and local component state only for transient UI.
- Return typed application errors (`code`, safe `message`, `fieldErrors`, optional `currentVersion`) rather than exposing database exceptions. Log the internal error with a request ID and show a recoverable UI state.

## Database conventions and initial schema

- Use Postgres UUID primary keys generated server-side, `timestamptz` in UTC, explicit organization timezone, `createdAt`/`updatedAt`, nullable `archivedAt`, and integer `version` columns on concurrently edited aggregates.
- Use database enums only for genuinely stable infrastructure states. Store configurable program values such as ability levels, age bands, disciplines, and time slots in tables with stable keys and display ordering.
- Store date of birth, not mutable age. Compute age as of the program/lesson date; retain imported `Age` only in source provenance for reconciliation.
- Model shared identity with `people`, then role/profile tables (`students`, `instructors`, `guardians`) and explicit relationship tables. This supports one person holding multiple roles without duplicating contact identity.
- Replace AM/PM/FULL_DAY overlap logic with program time slots containing local start/end times. Conflict checks compare actual time ranges, so a full-day slot naturally overlaps both half-day slots.

Suggested migration order:

1. `0001_auth_org`: Better Auth tables, `organizations`, `organization_memberships`, roles, invitations.
2. `0002_programs`: `seasons`, `programs`, disciplines, ability levels, age bands, time slots, recurrences, excluded dates.
3. `0003_people`: people/profiles, addresses, guardian relationships, contact methods, emergency contacts, restricted support records, instructor qualifications/availability.
4. `0004_registrations`: registrations, source snapshots, `external_identities`, relationship preferences, source-field ownership.
5. `0005_grouping`: rule sets/parameters, grouping drafts, draft groups, draft assignments, warnings, override reasons, approvals, operation log.
6. `0006_delivery`: stable season groups, revisions, effective-dated memberships, lesson instances, instance overrides, attendance, lesson notes.
7. `0007_integrations`: import batches/files/rows/matches, reconciliation summaries, exports, audit events.

Key constraints/indexes:

- Unique external identity on `(organizationId, sourceSystem, entityType, externalId)`.
- Unique generated group number within `(organizationId, seasonId, programId)`.
- Unique lesson instance per `(groupRevisionId, lessonDate, timeSlotId)`.
- Unique attendance per `(lessonInstanceId, studentId)` and one active assignment for each effective-date interval.
- Partial indexes for active/non-archived records; indexes covering season/program roster queries, instructor schedules, unresolved import rows, and draft warnings.
- Check constraints for non-empty effective intervals and valid local slot times. Use application-level transactional checks for cross-row schedule overlaps that cannot be expressed safely as a simple constraint.

## Server-function and transaction pattern

Every write follows one path:

1. A feature submits a Zod-validated command and an idempotency key/base version when applicable.
2. Auth middleware resolves session, organization membership, and role.
3. The application service revalidates authorization and input, opens a Drizzle transaction, loads the aggregate, and checks its version/state.
4. Pure domain code evaluates invariants and produces state changes/warnings.
5. Repositories persist changes and an audit event in the same transaction.
6. The server function returns a narrow view model; the client updates/invalidates TanStack Query state.

Use one server function per use case rather than generic table CRUD. Examples: `moveStudentInDraft`, `submitGroupingDraft`, `approveGroupingDraft`, `publishGroupingDraft`, `substituteInstructorForLesson`, and `recordAttendance`. Reads return role-specific projections so sensitive fields never reach an unauthorized browser.

Publication is one serializable transaction: lock the approved draft/version, rerun hard constraints, allocate stable group numbers, write group revisions and effective memberships, generate lesson instances from recurrences/exclusions, append the publication audit event, and mark the draft published. A repeated idempotency key returns the original publication result.

## Grouping engine contract

- Keep the first engine deterministic and pure TypeScript. Its input is a versioned immutable snapshot of registrations, instructor availability/qualifications, configurable rules, existing assignments, and relationship requests; its output contains proposed groups, assignments, scores, warnings, unplaced reasons, and an engine/rule-set version.
- Implement rules as registered modules with `evaluateHardConstraint` and/or `scoreCandidate` behavior. Persist only validated parameters/weights in Postgres; never store executable expressions.
- Initial hard constraints: enrollment/program compatibility, schedule availability, capacity/ratio ceilings, required instructor qualification, and explicit “must separate” relationships where configured.
- Initial soft scores: ability proximity, age cohesion, instructor preference/fit, “place together” requests, group-size balance, and assignment continuity. Restricted medical/support text is never engine input.
- Algorithm v1: partition by hard dimensions, create feasible candidate groups, greedily place most-constrained registrations first, assign instructors, then use deterministic local swaps/moves to improve the total score. Emit the reason for every material score and every unplaced registration.
- Test with fixed snapshots, property tests, and adversarial fixtures. Required properties include no hard-rule violations, no duplicate registration placement in a slot, deterministic output for identical input/version, and complete explanations for unplaced records.
- Benchmark before coupling it to an HTTP request. If the medium fixture cannot complete well within the Vercel execution budget, keep the same contract and move execution to the job adapter without changing UI/domain code.

## Draft collaboration and autosave mechanics

- Persist each draft move as a command in `draft_operations` with `commandId`, `draftId`, `baseVersion`, actor, operation type/payload, and resulting version. The draft aggregate version increments atomically.
- A stale command returns `VERSION_CONFLICT` plus the latest version. The UI refreshes, highlights what changed, and lets the coordinator reapply or discard the intended move; it never silently overwrites another editor.
- Undo submits a compensating command based on the stored operation, preserving audit history. Do not implement “undo” by deleting audit rows or restoring an entire stale client snapshot.
- Autosave applies small semantic operations (move student, assign lead, edit note), not a debounced replacement of the whole board. Display `Saving`, `Saved`, `Conflict`, and `Offline/retry` states in context.
- Draft warnings are recomputed for the affected groups after each operation. Publication always runs a complete validation pass.

## Core data model to design first

- Identity/access: organizations, users, auth accounts/sessions, memberships, roles, invitations.
- Programs: seasons, programs, configurable disciplines/levels/age bands/time slots, calendar recurrences/exclusions, rule-set versions.
- People: students, guardians/households, addresses, contact methods, emergency contacts, private structured medication/allergy/support flags with restricted source text, instructors, qualifications, preferences, and availability.
- Enrollment: season/program registrations distinct from students, with external-source identities, transaction/product provenance, source-owned field metadata, imported placement evidence, and optional financial snapshot fields kept outside the grouping aggregate.
- Grouping: grouping drafts/scenarios, generated recommendations, warnings, approvals, stable season groups, group revisions, effective-dated student/instructor memberships, lead assignments, and generated group numbers.
- Delivery: lesson instances, instance roster/instructor overrides, attendance statuses, and lesson notes.
- Integration/operations: import batches/files/rows, mappings, match decisions, reconciliation results, exports, and audit events.
- Capture invariants in both application services and database constraints where possible; document rules that remain soft or require human judgment.

## Known legacy registration source

- The 2025–26 registration export combines registration, participant, guardian/contact, product, assignment, safety, attendance, and notes data in one row. Treat it as a denormalized integration contract, not as the target schema.
- Use `Transaction_ID` as a candidate external registration key only. Do not treat it as a person ID until representative rows establish uniqueness/repetition semantics; maintain a separate external-identity mapping for student reconciliation.
- Map `Product_Header`, `Product_Date`, `Start_Date`, and `Total_Price` to source/provenance or registration snapshot data. Carve does not become a billing system merely because the source includes price.
- Treat imported `Instructor`, `Day`, `Time`, `Discipline`, `Level`, and `Lesson` values as placement evidence that can seed a reviewed draft. They must not silently overwrite an approved Carve grouping.
- Normalize `Medication`, `FoodAllergy`, `DrugAllergy`, and `SpecialCondition` into restricted structured categories plus preserved source text. Medical/support data may produce visibility or review warnings but must not make automatic placement decisions.
- Convert wide attendance columns (`Jan_3`, `Jan_4`, make-up columns, and similar) to dated lesson-instance attendance rows through a season-specific column/date mapping. Preserve the original cell and mapping provenance for reconciliation.
- Resolve field semantics for attendance values, identity matching, assignment updates, product dates, and the unmapped `IP_Code`/`Lesson` fields before freezing the import schema. Representative redacted rows are required before import implementation, not before repository scaffolding.

## Import pipeline internals

1. Upload to an `ImportStorage` adapter and create an import batch containing file hash, source adapter/version, uploader, and retention deadline.
2. Stream-parse CSV into source-specific raw schemas; reject malformed structure without mutating domain tables.
3. Normalize values into canonical staging DTOs with row/column provenance and validation issues.
4. Resolve stable external IDs first, then exact deterministic fallback keys. Send all ambiguous/fuzzy candidates to a human match queue.
5. Synthesize related files into proposed person/registration/contact/placement/attendance changes.
6. Produce a persisted no-write diff and reconciliation totals.
7. On confirmation, rerun preconditions and apply accepted changes in idempotent chunks/transactions while protecting Carve-owned fields.
8. Finalize batch status and downloadable errors; purge raw uploads/staging payloads according to policy while retaining hashes, decisions, counts, and non-sensitive audit provenance.

The initial adapter should recognize the exact 2025–26 headers and fail clearly on missing/renamed columns. Attendance column-to-date mappings belong to the adapter configuration for that season; parsing a header such as `Jan_3` without an explicit year/date mapping is forbidden.

## First implementation sequence

The rebuild should begin with thin, deployable vertical slices rather than implementing the entire schema or UI at once.

### PR 1 — Repository skeleton and deployable baseline

- Scaffold the separate TanStack Start app with Bun, Tailwind/shadcn, strict TypeScript, the directory boundaries above, environment validation, Vitest, Testing Library, and Playwright.
- Add CI for format check, lint, typecheck, unit tests, build, and a smoke test; connect a Vercel preview with `/health` that does not expose secrets.
- Add the documentation skeleton and ADRs for the chosen stack.
- Exit: a pull request deploys a working empty shell and all gates run from a clean checkout.

### PR 2 — Postgres, migrations, and test infrastructure

- Connect Drizzle to local Postgres and Neon; implement migrations `0001`–`0002`, repository transaction helpers, synthetic factories, and isolated integration-test database setup.
- Add migration apply/check scripts, environment safeguards that prevent test/dev commands from targeting production, and a backup/restore proof-of-concept.
- Exit: CI applies migrations to an empty database and integration tests commit/rollback representative organization/season records.

### PR 3 — Authentication and authorization spine

- Integrate invite-only Better Auth credentials, organization membership, admin/coordinator/instructor roles, protected `_app` layout, invitation/reset/session flows, and a seeded local admin.
- Implement `requirePermission` in the application layer and authorization matrix tests before business CRUD.
- Exit: anonymous, wrong-organization, and wrong-role calls fail server-side; no public registration exists.

### PR 4 — First full business vertical slice

- Implement season/program configuration plus student/person/guardian/registration list, detail, create, edit, archive, and audit history.
- Include Drizzle schema/repository, application use cases, server functions, Zod contracts, TanStack Query hooks, accessible UI states, and Playwright coverage in the same PR series.
- Exit: an authorized coordinator can create a season and registration, reload the browser, observe persisted data, and see the audit event.

### PR 5 — Instructor and scheduling foundation

- Add instructor profiles, qualifications, availability, configurable time slots/recurrences, calendar exclusions, and actual-range overlap tests.
- Generate a preview calendar without yet creating production lesson instances.
- Exit: the system explains availability/qualification conflicts using synthetic fixtures.

### PR 6 — Registration import discovery slice

- Implement the exact-header detector and parser for the known CSV using synthetic rows, persisted import batches, structural validation, normalized preview DTOs, and reconciliation counts; do not apply changes yet.
- Finalize this adapter only after representative redacted samples and field dictionaries arrive.
- Exit: upload produces a no-write preview with row-level errors and no domain-table mutations.

### PR 7 — Grouping rules and engine

- Implement versioned rule sets, engine contract, deterministic v1 algorithm, explanations, property tests, and medium-scale benchmark fixtures.
- Add a developer/admin diagnostic page that displays engine output before committing to the final builder interaction.
- Exit: fixtures satisfy hard invariants, determinism, explanation completeness, and agreed runtime/memory budgets.

### PR 8 — Draft persistence and builder prototype

- Add grouping draft/group/assignment/warning/operation tables and semantic command server functions with version conflicts and compensating undo.
- Build the approved group-board UX against real server contracts: unplaced queue, group summaries, detail inspector, click/keyboard moves, optional drag-and-drop, warnings, autosave status, and conflict recovery.
- Exit: two simulated coordinators cannot silently overwrite each other; all primary tasks work without drag-and-drop.

### PR 9 — Auto-draft, review, approval, and publication

- Connect engine output to draft creation, override reasons, preview summaries, coordinator submission, admin approval, and atomic publication.
- Generate stable numbered groups, effective-dated memberships, and lesson instances from the season calendar.
- Exit: the full generate-adjust-submit-approve-publish journey is transactional, idempotent, audited, and covered by Playwright/integration tests.

### PR 10 — Lesson operations

- Add dated roster exceptions, instructor substitutions, instructor-scoped schedule/roster views, need-to-know student projection, attendance, lesson notes, print rosters, and CSV export.
- Exit: instructor authorization and sensitive-field projection tests pass; instance edits do not corrupt future recurring assignments.

### PR 11 — Production import apply and reconciliation

- Add deterministic identity resolution, human ambiguity queue, cross-file synthesis, protected field ownership, idempotent apply, retries, raw-data retention/purge, downloadable error reports, and runtime/load tests.
- Activate durable background processing only if the measured files exceed synchronous safety margins.
- Exit: rerunning the same files creates no duplicates, approved Carve-owned assignments survive, and totals reconcile.

### PR 12 — Launch hardening and cutover

- Complete observability, security/data-policy review, performance/concurrency work, backup restore, user documentation, two full dress rehearsals, cutover automation, rollback, and support runbooks.
- Exit: every launch gate below has evidence and an owner; the final import can be verified before the spreadsheet freeze is released.

## Definition of done for every vertical slice

- Database migration and rollback/forward strategy reviewed; no manual production schema edits.
- Server-side validation and application-layer authorization cover every read/write.
- Audit and sensitive-data behavior documented; logs/fixtures contain no real PII.
- Unit/integration tests cover domain and transaction behavior; Playwright covers changed critical journeys.
- Loading, empty, error, disabled, focus, keyboard, and conflict states are implemented where applicable.
- Relevant ADR, data dictionary, role matrix, import contract, or runbook changes ship in the same pull request.
- `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`, integration tests, and `bun run build` pass in CI.

## Phased delivery

### 1. Discovery, terminology, and acceptance contract

- Turn spreadsheet/report examples into a field inventory and source-of-truth matrix. Start from the known registration headers, then add representative redacted rows and dictionaries for attendance, identity, assignment, and product semantics before schema sign-off. Resolve customer-facing terms such as season, program, group, lesson, roster, and draft.
- Write a versioned rule catalog classifying every grouping factor as hard constraint, soft score, warning, or display-only information. Include capacities/ratios, availability, relationships, instructor fit, support needs, and override reasons.
- Define measurable launch journeys and acceptance criteria for coordinators, admins, and instructors. Because the product owner is the user proxy, require task-based prototype walkthroughs and recorded sign-off at each UX gate.
- Produce the initial data classification, retention, deletion, access, and incident-response decisions before real child/contact/medical data enters a shared environment.

### 2. Repository and production foundation

- Scaffold the new repository with pinned dependencies, Bun scripts, strict TypeScript, formatting/linting, environment validation, and dev/test/prod configuration.
- Add Drizzle migrations, local Postgres development, Neon environments/branches, seed factories containing synthetic data only, and migration/rollback procedures.
- Establish CI gates for typecheck, lint, unit/integration tests, migration checks, build, dependency/security scanning, and preview deployments.
- Add structured logs with request/user correlation, error reporting, health checks, audit events, secret handling, backups/PITR verification, and sanitized telemetry.

### 3. Domain and service layer

- Implement the schema and repository interfaces, then server-authoritative use cases for seasons/programs, students, instructors, availability, qualifications, and enrollments.
- Implement authorization in application services, not only route guards. Restrict instructors to assigned lesson instances and need-to-know student fields.
- Build versioned rule evaluation with human-readable explanations. Add property/invariant tests for conflicts, capacities, publication validity, effective dates, and lesson generation.
- Implement grouping engine v1 as deterministic pure TypeScript: partition by hard constraints, score soft preferences, balance capacities/ratios, run local improvement, and return placements plus reasons/unplaced records. Benchmark medium-scale fixtures before accepting it.

### 4. UX architecture and high-fidelity prototype

- Design the information architecture around the primary path: choose season/program, verify source data, generate draft, review exceptions, adjust groups, submit, approve, and publish.
- Prototype the group builder before wiring production mutations. Prefer a clear group-board/workspace with an unplaced queue, at-a-glance capacity and warning summaries, detail inspector, multi-select moves, undo, and explicit conflict explanations.
- Keep drag-and-drop as an enhancement, never the only interaction. Provide click/keyboard movement, visible focus, accessible labels, confirmation for destructive publication, and recovery from stale/conflicting edits.
- Use progressive disclosure: default to actionable exceptions and recommendations while keeping sensitive or advanced rule detail behind deliberate access. Replace alerts with inline errors, toasts, and contextual recovery actions.
- Validate empty/loading/error states, narrow desktop/tablet widths, print layouts, and the instructor attendance flow against the frontend-design checklist before implementation approval.

### 5. Production workflows

- Build season/program setup and configurable rule administration.
- Build student/instructor management with server-side filtering, pagination, validation, provenance, safe archive/restore, and audit history.
- Build grouping drafts with autosave, row-version conflict handling, undoable assignment operations, override reasons, preview summaries, coordinator submission, admin review, and atomic publication.
- Generate dated lesson instances from the published recurring schedule; preserve instance-specific substitutions/attendance when future season-group revisions occur.
- Add instructor schedules/rosters, need-to-know safety and emergency context, attendance (`present`, `absent`, `late`, `excused`), optional notes, printable rosters, and authorized CSV exports.

### 6. Multi-file import and reconciliation

- Obtain representative reports before implementation and create a fixture corpus with sensitive values removed. Define per-report schemas, versions, encodings, delimiters, required columns, and stable/fallback match keys.
- Add a versioned adapter for the 2025–26 registration export. Split each source row into person, guardian/contact, registration/product snapshot, imported placement evidence, safety/support data, and normalized per-date attendance records; retain row/column provenance throughout.
- Implement staged upload, parse/normalize, cross-file synthesis, deterministic matching, ambiguity queues, validation, and a no-write preview. Never silently fuzzy-match uncertain people.
- Show creates, updates, unchanged rows, conflicts, invalid rows, and locally owned fields protected from overwrite. Require an authorized confirmation and apply the batch transactionally/idempotently.
- Persist source IDs, file hashes, mappings, row outcomes, and operator decisions so reruns are explainable and safe. Provide downloadable error/reconciliation reports and a retry path.
- Load-test real-size files; keep synchronous processing only if it stays comfortably within hosting limits, otherwise activate the predesigned object-storage plus durable-job adapter.

### 7. Authentication hardening and Entra readiness

- Launch temporary auth as invitation-only Better Auth credentials with verified email, secure password reset, session revocation, rate limits, CSRF protection, and no public registration.
- Add role administration, authorization tests, sensitive-field response shaping, security headers, audit coverage, and a documented access review process.
- Before Entra migration, confirm tenant/app-registration ownership and claims. Link by Entra `tid` + `oid`, test account linking and rollback in staging, then disable password sign-in only after all active users are mapped.

### 8. Verification, rehearsal, and big-bang cutover

- Maintain unit tests for rules/optimizer, Postgres integration tests, server-function authorization tests, import golden files, component accessibility tests, and Playwright journeys for import through publication and attendance.
- Run concurrency, performance, backup restore, permission, export/print, and failure-injection tests. Require zero unresolved severity-high security/access findings and no unexplained import discrepancies.
- Because rollout is big-bang, require at least two full dress rehearsals: production-like import, reconciliation totals, grouping generation, approval/publication, exports, and restore/rollback timing.
- Define a spreadsheet freeze window, final import checksum/totals, named go/no-go owner, rollback threshold, database snapshot, support coverage, and post-launch verification. Do not treat deployment success as cutover success.

## Documentation deliverables

- `README.md`: setup, Bun commands, environments, architecture summary, and links to canonical docs.
- `docs/product/`: glossary, user roles/journeys, launch scope, acceptance criteria, and versioned grouping rule catalog.
- `docs/architecture/`: context/container diagrams, module boundaries, ERD/data dictionary, tenancy strategy, server-function conventions, job boundary, and ADRs for TanStack Start, Drizzle, Neon/Vercel, Better Auth, and optimizer approach.
- `docs/security/`: threat model, RBAC matrix, sensitive-field policy, retention/deletion policy, audit model, secrets, incident response, and Entra migration procedure.
- `docs/imports/`: source-of-truth matrix, report schemas, mapping/matching rules, ownership rules, idempotency/reconciliation behavior, and operator runbook.
- `docs/operations/`: deploy/migrate/rollback, backup restore, monitoring/alerts, season setup/closeout, cutover, and support troubleshooting.
- `docs/testing/`: test strategy, fixture policy, performance targets, accessibility checklist, and release checklist.
- Keep docs reviewed in the same pull requests as schema, rule, access, or operational changes.

## Launch gates

- All launch journeys pass with production-like data; the owner-proxy signs off on the group-builder prototype and final workflow.
- Auto-draft never violates hard constraints, explains all warnings/unplaced records, and meets benchmark targets on the agreed medium dataset.
- Every write is authorized, validated, transactional where needed, conflict-aware, and auditable; sensitive instructor responses expose only approved fields.
- Repeat imports are idempotent, preserve Carve-owned fields, reconcile to expected totals, and provide actionable ambiguity/error handling.
- Restore and cutover rehearsals pass; observability, support, rollback, retention, and incident runbooks have named owners.
- No production data or launch occurs until the data-policy review and temporary-auth security review are complete.
