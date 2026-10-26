# Reliability and grouping release verification

This change adds migrations 0017–0020: attributed survey support notes and enrichment review results, configured weekdays/instructor preferences, finalized placement snapshots/change requests, assistant staffing on dated revisions, and historical group descriptions.

## Rollout

1. Run the normal release migration history check and rehearse all migrations against an isolated database. Never run the demo seed on production.
2. Review weekday backfill results. Only existing group recurrences, draft groups, and reviewed registration schedules establish weekdays automatically; configure remaining sessions explicitly.
3. Deploy the application and run **Re-link and sync** to revisit confirmed responses. Review conflicting/ambiguous evidence and new restricted support notes; existing profile values and staff notes remain intact.
4. Upload the current export set again to obtain an adapter-v3 preview. Historical batch previews remain immutable. The optional DoB report is useful for both identity corroboration and missing birthdates.
5. Establish instructor availability. Use scoped **Re-group all** to replace legacy drafts and clear their obsolete assignments. Inspect preview and retain the latest-operation undo window until the replacement is reviewed.
6. Finalize placements independently of staffing. Publish only after staffing and calendar checks pass. Use the audited dated-change panel for subsequent changes.

## Verification evidence

The latest local export set resolved all 1,060 prompt rows without identity issues. It yielded 596 distinct child IDs with agreeing validated DoBs, 617 registration facts with birthdates, and 40 facts with lesson comments. The file contains 530 ability-answer rows; registration-level prompt coverage is reported separately in preview.

Regression coverage includes legacy/name-based prompts, ambiguous identity refusal, blank/conflicting evidence, linked-response backfill, repeated sync and medical-note preservation, server pagination, zero-instructor generation, strict levels, scoped rebuild/undo, stale previews, coordinator approval, temporary returns, published future moves, and preservation of completed attendance/notes. Browser scenarios cover normal operations, refresh retaining an unsaved profile edit, rebuild preview/apply/undo, survey import/sync, finalization before staffing, and cohort configuration. Production builds are checked locally.

Local verification: 129 unit tests and 39 integration tests passed. All four browser scenarios passed against a separately seeded local database. TypeScript and ESLint passed. Migrations 0017–0020 were exercised through the isolated database suites; no production migrations or data changes were applied.

Production deployment metadata was inspected read-only: the latest production deployment was created October 21, 2026. These local changes have not been deployed. Production database migration state and affected-record counts remain unverified: automatic approval review rejected downloading the full production environment because it would export credentials beyond the needs of the diagnostic. Use an approved narrowly scoped read-only database connection for that remaining operational verification.
