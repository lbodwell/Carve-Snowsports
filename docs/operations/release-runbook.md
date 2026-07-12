# Release and cutover runbook

## Before deploying

1. Confirm preview CI passes: format, lint, typecheck, unit tests, integration
   tests, and build.
2. Confirm production secrets and Neon branch/database are configured.
3. Apply reviewed Drizzle migrations through the deployment process.
4. Verify `/health` responds without revealing environment details.
5. Verify backups/PITR and document the restore point.

## Cutover rehearsal

Run this sequence twice against production-like, synthetic data before the
spreadsheet freeze:

1. Upload the registration source and reconcile row totals.
2. Review unresolved identity matches and import errors.
3. Generate, adjust, submit, approve, and publish a group draft.
4. Confirm dated lesson instances, instructor projection, attendance, print,
   and CSV export behavior.
5. Restore the pre-rehearsal database state and record measured recovery time.

## Big-bang cutover

- Freeze spreadsheet writes for the agreed window.
- Take and verify a final source checksum and record totals.
- Create a pre-import restore point.
- Run the final import and reconcile counts before enabling staff access.
- Assign a named go/no-go owner and support contact.
- Roll back if reconciliation fails, authorization leaks sensitive data, or
  publication cannot complete atomically.
