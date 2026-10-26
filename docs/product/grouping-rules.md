# Grouping rule catalogue

## Rule set 4

Generate by configured weekday, time/cohort, discipline, season-start age band, and exact level. Combine all compatible students in each category into one group, with no size-based splitting. The recommended ratio is four students per assigned instructor (lead and assistants); exceeding it shows a warning and never blocks placements, splits, approval, or publication. Generation has no instructor dependency and assigns no instructors. Incremental suggestions preserve existing placements. Unknown birthdate/discipline/level/session evidence stays visible for review.

Manual level mixing and age-band exceptions require recorded reasons. Discipline, active registration, and schedule compatibility remain server-enforced. Session 1/2 stay separate; full-day sessions overlap the corresponding AM/PM times. A child cannot hold overlapping placements through different registrations.

Instructor assignment requires manager-recorded availability and discipline qualifications. Missing availability is unknown and blocks assignment. Age/level preferences rank eligible suggestions. Publication and finalized changes additionally validate overlapping published commitments across programs.

Configured must-separate constraints remain supported by the pure engine; relationship-request administration is not part of this release. Restricted medical content never enters grouping optimization.

## Lifecycle

Editable drafts support scoped atomic rebuilds with immutable prior snapshots and latest-operation undo. Finalized placements are distinct from staffed publication. Finalized changes use versioned requests with actor, reason, effective dates, and before/after references. Coordinators propose; administrators apply. Temporary exceptions expire back to the underlying placement. Splits retain parent lineage; empty groups can be closed and reopened through audited changes.

Published changes regenerate only affected untouched future lessons. Existing completed lesson records, attendance, and notes remain immutable. All group references retain stable IDs; descriptions are characteristic-based and historical descriptions are frozen in events and lesson revisions.
