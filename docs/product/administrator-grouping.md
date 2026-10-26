# Administrator guide: reliable imports and student-first grouping

## Import and review intake

Upload the child product listing with optional purchaser, prompts, and customer DoB exports (up to four CSVs, or a ZIP containing them). Use the same report filters and date range. Adapter `2026-27@3` supports both prompts variants. The customer-name variant requires unique corroborating listing evidence; ambiguous identities never receive an arbitrary match. Adding the DoB report supplies transaction/name evidence and fills missing birthdates by child IPCode. Existing birthdates are preserved and disagreements appear in preview.

Lesson comments remain attributed import placement notes. Purchasers are not automatically treated as guardians. Explicit paired returns update registrations; an absent row does not cancel a student. Uploading the files again after this adapter change creates a fresh preview; old batches retain their original reconciliation.

Confirmed survey links automatically fill missing birthdates and uniquely applicable registration discipline/level, and store medical answers as separate restricted notes with response/date attribution. Submission, import application, manual confirmation, and **Re-link and sync** use the same service. Sync revisits existing links, preserves identities and populated values, and flags conflicting or ambiguous evidence. Review medical notes on the student profile; saving staff notes does not replace survey notes.

The survey inbox searches all responses server-side by child, parent email, or linked student. Filter by survey, session, linking/review status, discipline, level, and dates; sort and choose 25/50/100 rows. Open a response to load its full answers and matching controls. Refresh reloads data without running synchronization.

## Prepare programs and instructors

Configure active session weekdays, time ranges, seasonal cohorts, and calendar dates in **Seasons & programs**. Existing group and reviewed-schedule evidence seeds weekdays during migration; uncertain schedules require configuration. Session 1 and Session 2 remain distinct. Dates can remain pending while drafting but must be set before publication. Full-day lessons still overlap AM/PM lessons.

Manage instructor availability and age/level preferences from the instructor editor. Availability is program/cohort/day/time specific. Missing availability means unknown; it does not mean available. Qualifications, recorded availability, and overlapping commitments govern eligibility. Preferences rank eligible suggestions; they never assign staff automatically.

## Build and rebuild drafts

The board separates students by day → time/cohort → discipline → age band → level. Generation puts all compatible students in one group per category, with no size limit and no instructor assignments. Groups initially show “No lead instructor.” Once staffed, groups above four students per assigned instructor show an advisory warning: 5+ with one, 9+ with two, and so on. Add instructors or split groups as appropriate; size never blocks changes or publication. Missing information remains visible with reasons. **Suggest remaining placements** preserves existing placements.

Group titles describe their characteristics. Duplicate groups use the lead instructor or a stable letter suffix; identical instructor names retain a suffix. IDs and legacy numbers remain internal. Outside the board, descriptions include day/time/cohort. History retains the descriptions recorded at the time.

Select a student to keep placement context visible, then drag them or use **Place student here**. Supply a reason for intentional level mixing or age exceptions. Select several members and use **Split selected into new group**. Instructor suggestions explain availability/preferences; assign with the selector, drag from the pool, or remove through the group controls. Drag an assigned lead back to the pool to remove them.

**Re-group all** defaults to the visible day/time/cohort. Choose **Whole program** explicitly for broader cleanup. Preview shows old/new group counts, affected registrations, unresolved students, and assignments to clear. Applying replaces scoped groups and all their instructor assignments atomically, preserving neighboring sessions, profiles, registration data, reviewed schedules, and student notes. Old layout and group notes remain available under **Previous rebuild layouts**. **Undo rebuild** is available only while that rebuild remains the latest operation. Changed previews must be regenerated.

Submitted drafts must return to editing before rebuilding. Finalized placements cannot use draft rebuilding.

## Finalize, staff, and operate

Coordinators submit drafts; administrators **Finalize student placements**. Finalization does not require instructors. **Publish groups** requires valid staffing and creates dated lessons.

After finalization, use **Finalized placements and history** to move students, split groups, change staffing/details, or close/reopen an empty group. Every request needs a reason and effective date. Coordinators propose; administrators approve/reject or apply immediately. A one-day or bounded date range returns to the underlying placement when it ends. Use the as-of view to inspect another date and the student filter to follow their timeline.

Approval rechecks permissions, versions, sessions, and staffing. Source/destination changes commit together. Only affected future lessons are regenerated; completed attendance and notes remain on their original lesson IDs. Changes affecting a lesson with recorded operational data are rejected. Reversals are new audited changes.

## Monitor readiness

The overview separates students from registrations and shows missing information, unplaced registrations, survey coverage, unstaffed groups, and pending changes. Charts cover enrollment, age/level distribution, group sizes, and staffing; links open relevant filtered views and tables provide accessible equivalents. Draft/finalized/published counts describe the current layout. Attendance analytics are outside this release.

Refresh controls preserve local filters and edits. An unsaved editor retains its values; refresh does not resolve a concurrent-edit conflict automatically.
