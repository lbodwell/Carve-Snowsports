# Scheduling and survey review release

Apply migration `0021_survey-review-provenance` before deploying the application changes. It records link provenance from audit evidence, flags unassessed legacy links, corrects obsolete 9:00 weekday cohort slots to 9:30–11:00, and adds missing weekend 9:00–12:00 slots and ages 11–13 bands where imports establish those products. Existing lesson records and published groups are not regenerated.

After deployment, use **Parent surveys → Re-link and sync** once per organization. An authorized staff account can alternatively run:

```powershell
bun run scripts/reconcile-survey-matches.ts <organization-id> <staff-user-id>
```

Use the deployment's existing database configuration. Reconciliation runs in a transaction, records reopened automatic links, preserves staff-confirmed links, and does not delete previously enriched roster values or attributed support records. Repeating it does not duplicate support records or reopen unchanged staff acknowledgements. Historical links with unknown provenance receive a fresh complete assessment: uniquely matching identity, birthdate, registration, discipline, session and level can revalidate automatically with an audit record. Conflicts and ambiguous identities remain in review.

Check the Needs review queue and Students survey-status filter after reconciliation. Verify a Thursday/Friday cohort at 9:30–11:00 and an imported Saturday/Sunday `11-13yrs | 9am` registration at 9:00–12:00. Missing or ambiguous schedules appear separately under Schedule review. Conflicting values require explicit acknowledgement; roster edits continue through the existing student editor.

Staff reviewing a birthdate conflict can keep the roster date or explicitly use the survey date. Replacing a date requires acknowledgement and a current evidence key; the old and new dates, chosen resolution and staff actor are recorded. Survey answers and other roster values are preserved. Run **Re-link and sync** again after deploying the follow-up review fix to clear already-stored migration/provenance-only review flags. Open response details now reload when list review evidence changes.

The checked-in newer order-customer export contains both weekday cohort products and 11 weekend 9 a.m. registrations (3 Saturday, 8 Sunday). Regression fixtures use the same product dimensions without child or guardian details.

Instructor assignment uses availability, discipline qualification, and overlapping commitments as eligibility checks. Age/level preferences only rank eligible suggestions. Ski/snowboard qualifications are recognized across programs within the same organization, including records originally attached to an older program; this correction requires no additional data migration. Dropping a free instructor onto an editable group adds them to the team, preserving the existing lead or making the first instructor the lead. Details show eligible choices plus already assigned instructors so invalid assignments can be removed.
