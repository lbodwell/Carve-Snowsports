# Friday PM, import scope, and survey note review

Migration `0022_friday-pm-survey-notes` adds Friday 13:00–15:00 slots for both numbered sessions to existing programs. It inherits each cohort's AM calendar when present, preserves previous medical review decisions, and hides exact empty survey answers without deleting their original responses. New programs receive the PM slots by default. Apply this migration before running the updated application.

Imported products can carry both `Session 1`/`Session 2` and `1pm`; these now retain both dimensions. Existing snapshots can also resolve PM from the original product text. Staff can correct a registration's session through the existing schedule controls. A product carrying only a numbered session retains its prior AM interpretation; the importer cannot infer PM without time evidence.

Survey matching now compares both cohort and actual hours. Friday AM surveys no longer match PM registrations. Review the PM survey options and run Re-link and sync after release to reassess existing enrollment evidence.

Survey response details offer Keep/mark reviewed, Hide, and Restore for medical and placement notes. Grouping note panels link to the student's survey search. Hidden notes stay hidden across re-linking; the original text and review audit remain. Medical review status comes from the stored support record instead of the presence of text in the survey answer.

## November 2 export findings

The supplied folder contains 606 child-listing rows, 395 purchaser rows, 1,040 prompt rows, and 663 birthdate rows. All 606 child-listing rows and all 395 purchaser rows are outside the seasonal program: daily lessons, private lessons, or lesson packs. Return row 18 is a daily children's lesson; row 131 is a private lesson with multiple potential sales. Re-export those two listing reports with matching filters for the intended Children's Seasonal Program and season.

The prompt export is already filtered to seasonal products: all 1,040 rows explicitly name the Children's Seasonal Program for 26/27. The birthdate export uses numeric product IDs, so its product scope cannot be determined from names; 554 of its 663 rows share transaction IDs with the seasonal prompt export. It has not been established as incorrectly filtered.

The importer excludes unrelated listing and prompt products and reports the excluded listing count. A batch with no seasonal registrations is blocked with one clear export-filter error. Genuine unresolved seasonal returns remain blocked, with product, date, amount, and candidate sale rows shown. No ambiguous refund is automatically applied to an enrollment.

Run the aggregate diagnostic without applying an import:

```powershell
bun run scripts/inspect-registration-imports.ts 'C:\path\to\exports'
```

## Instructor finding

Live read-only inspection confirmed Olivia Lindsay has Saturday Full day availability, plus an existing Saturday Morning Ski / Ages 4–6 / Level 2 assignment. That assignment overlaps Full day. Grouping now shows overlapping assignments in the instructor pool with their day, time slot, and group instead of silently omitting the instructor. Conflicting assignments remain prohibited. No live assignments were changed during investigation.
