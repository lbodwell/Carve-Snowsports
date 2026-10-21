# Administrator readiness review — 2026-10-18

Updated 2026-10-19 with the administrator's session definitions and cohort-calendar verification.

Deployment update 2026-10-21: the controlled Production release and isolated Preview
migrations passed. See [Controlled production releases](production-release.md).
Hosted import rehearsal and the operational readiness items below remain open.

## Assessment

The project has useful domain and authorization foundations, but the previous
administrator workflow was not a credible operating interface. The changes in
this review replace the group-building surface and connect import, identity
review, survey matching, and incremental placement. They do not authorize a
production cutover or close the documented data-policy requirements.

The canonical walkthrough is [Administrator guide](../product/administrator-grouping.md).

## Documents reviewed

- Root README and the full production rebuild plan.
- Architecture overview.
- Launch journeys, grouping rules, and data ownership.
- Both seasonal import contracts/analyses.
- Security baseline and Entra migration runbook.
- Handoff, Vercel deployment guide, and release/cutover runbook.
- Test strategy, CI configuration, package scripts, and environment template.

The review traced those claims through route loaders, feature UI, server
functions, application services, domain algorithms, schema/migrations, storage,
workflow integration, and tests. Source exports containing real student data
were not used as fixtures or copied into the review.

## Findings addressed

| Finding                                                                                      | Result                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every group repeated the full unplaced roster, with configuration forms always expanded      | One searchable roster beside compact group cards; settings live in a drawer. Click/keyboard moves connect a selected student with a destination.                                                                                      |
| “Unplaced” was calculated only against visible groups                                        | Counts now cover all sessions. A Sunday placement is not misrepresented on Saturday.                                                                                                                                                  |
| Grouping selected the oldest program without an administrator choice                         | Explicit, shareable season/program selection; newest seasons are preferred initially. Empty setup has a next step.                                                                                                                    |
| Generation assigned every registration to Saturday and the first time                        | Partition suggestions by reviewed/exact imported session. Unknown source labels remain unresolved. Native registrations use the explicitly selected session.                                                                          |
| An instructor could be generated into four simultaneous groups                               | One simultaneous group per instructor, including overlapping actual time ranges across session buckets.                                                                                                                               |
| Target size and ability differences had little effect on forming new groups                  | Version 2 sorts consistently by hard dimensions and ability, and starts another feasible group at the target size or a substantial ability difference when staff are available.                                                       |
| Later imports and data corrections required rebuilding the draft                             | Incremental suggestions retain existing placements and fill compatible open groups before creating additional groups.                                                                                                                 |
| Submitted/approved drafts could not be returned for correction                               | Authorized, version-checked return-for-changes action with audit history.                                                                                                                                                             |
| UI-only capacity checks and stale qualifications could reach publication                     | Shared server validation at placement, group edits, submission, approval, and publication; checks enrollment, capacity, discipline, session, qualifications, and student/instructor overlap. Publication uses serializable isolation. |
| Survey matching happened only at submission and never established a usable reviewed link     | Confirm exact links, reconcile after import or on demand, and provide an audited human matching queue. Confirmed links are preserved.                                                                                                 |
| Aspenware students lack DOB, leaving the survey data disconnected                            | Human confirmation can explicitly fill missing DOB and program-specific discipline/ability without overwriting existing values.                                                                                                       |
| Imports blindly created people despite similar existing students                             | Stable external identities remain authoritative. Plausible name candidates require a reviewed link/create decision, persisted across all rows for that participant.                                                                   |
| Import hash reuse ignored destination program                                                | Fingerprints include program, adapter version, and sorted source hashes. Existing source registrations cannot silently move between programs.                                                                                         |
| Apply accepted unfinished states and concurrent apply could race                             | Reconciled/applying states only; organization-level serialization and transactional idempotency.                                                                                                                                      |
| Workflow was installed but not integrated with Vite, and database work lacked step isolation | Add the installed SDK's Vite integration and explicit steps. Apply runs durably with membership/permission revalidation. Failures return safe messages without source cell values.                                                    |
| Deployed upload bodies could exceed hosting request limits                                   | Authenticated browser-to-private-Blob transport with actor-owned paths, short-lived scoped tokens, byte limits, server validation, and temporary-object cleanup. Local filesystem fallback remains.                                   |
| ZIP expansion checked size only after allocating decompressed data                           | Check declared entry count/size before decompression, then verify actual bytes and CSV roles.                                                                                                                                         |
| Browser refresh lost import context; polling failures were unhandled                         | Recent batch picker, refresh control, bounded safe error presentation, visible source issues, persisted decisions, and retry processing.                                                                                              |
| Token survey routes could be intercepted by an anonymous parent route                        | Parent renders its outlet for token routes and does not attempt anonymous access first.                                                                                                                                               |
| Sign-in and parent survey controls accepted typing before hydration                          | Forms remain disabled until their handlers are ready, preserving entered values.                                                                                                                                                      |
| Pulled Preview settings selected the wrong origin/runtime for local browser tests            | Browser tests use an isolated Node/Vite server, clear Vercel environment detection, and set an explicit local Workflow callback URL.                                                                                                  |
| Lesson detail routes could be hidden by the parent schedule                                  | Parent renders its child outlet when a detail route is selected.                                                                                                                                                                      |
| Local raw import storage was not ignored by Git                                              | Ignore private import storage, temporary verification files, and corresponding formatting/lint paths. Remove session/auth-response logging from browser tests.                                                                        |

## Remaining launch work

1. **Actual cohort dates.** Session 1 and Session 2 now have separate configurable
   cohorts, date windows, and no-lesson dates. Groups can be prepared before
   dates are known; publication requires their actual dates. The school still
   needs to supply those dates. Weekend AM is 10–12, PM is 1–3, and Full Day is
   10–3, per the administrator's clarification. Full Day overlaps both periods.
2. **Published revisions.** Published boards are readable. Effective-dated
   revisions, mid-season arrivals after publication, and preservation of existing
   lesson exceptions need an explicit supported workflow.
3. **Staff availability and relationships.** The schema/workflow does not yet
   capture working hours, leave, or structured must-separate/together requests.
   The pure engine's relationship types alone do not implement an administrator
   input path. Capacity and rule administration remain code defaults.
4. **Delivery operations.** Attendance, lesson notes, substitutions, print, and
   exports are still incomplete. The `/lessons/today` surface remains a prototype.
5. **Hosting evidence.** Rehearse actual private Blob client uploads and durable
   Workflow on Preview, including large redacted ZIPs, retries, revoked staff
   access, retention, and deployment protection. Local tests cannot certify the
   configured production services.
6. **Retention and operations.** Raw source/staging cleanup, backup/PITR restore
   evidence, error monitoring, support ownership, and the two cutover rehearsals
   remain required by the existing runbooks.
7. **Policy and acceptance.** Retention, deletion, access review, and incident
   response require the school's decisions. Run task-based acceptance with an
   administrator on the redesigned workflow before declaring it operational.

## Verification

Verification uses synthetic fixtures and isolated local databases. Migration
`0015_lesson-session-calendars.sql` adds optional date ranges, no-lesson dates,
and seasonal cohort identifiers to lesson sessions. Existing sessions retain
their regular-season behavior. Apply the migration before deploying these
changes. No production database has been migrated.

- Final unit/component suite: 20 files, 82 tests passed.
- Final PostgreSQL integration suite: 7 files, 27 tests passed. This includes
  separate numbered cohorts, shared staff across successive cohorts, dated
  publication with holidays, fresh approval after calendar edits, immutable
  published sessions, and safe recovery when import dispatch fails.
- Browser suite: all 4 tests passed against the compiled production Node server,
  including a fresh Aspenware import through
  durable apply, survey identity review and missing-data completion, incremental
  grouping, approval/publication, and a personal survey invitation with anonymous
  submissions disabled. The fourth scenario configures separate numbered
  cohorts with dates pending and verifies both choices on the group board.
- TypeScript checking, ESLint, formatting, and the production Vite/Workflow build
  passed. Browser tests used a separate synthetic database; integration tests use
  the guarded local `carve_test` database.
- Browser verification builds the production artifact before serving it, avoiding
  development reloads interrupting survey entry. The configuration scenario
  reuses the verified administrator session; production login throttling stays
  enabled. Local auth reports a shared IP bucket when no proxy IP is present;
  verify trusted client-IP forwarding in the deployed environment.
- Browser layout review covers desktop, the group-settings drawer, and 390 px
  mobile width; no horizontal overflow or browser exceptions in the synthetic
  preview.
- These local results do not verify the deployed private Blob store or Workflow
  configuration. No deployment or production data migration was performed.
