# Administrator guide: registrations to lesson groups

## Prepare the roster

1. Create a season and program in **Seasons & programs**. Configure the actual
   lesson times, disciplines, levels, and age bands.
   In **Time slots**, choose the seasonal cohort separately from its hours.
   **Session 1** and **Session 2** are different seasonal date ranges. Their
   exact dates can remain blank while groups are being prepared. Use the
   weekend-hour buttons for AM (10–12), PM (1–3), or Full Day (10–3).
   Give each cohort/time combination a clear label, such as “Session 1 AM”.
2. Add instructors and their discipline qualifications in **Instructors**.
3. Open **Registration import**, choose the destination program, and drop in
   a ZIP or the individual Aspenware CSV exports. The customer product listing
   is required; the by-order listing and product prompts are optional.
4. Wait for reconciliation. Review totals and any source issues. Correct source
   errors and upload corrected files rather than forcing an invalid batch.
   Missing optional ability/purchaser information does not block import. Blank
   ability answers and absent prompt records are shown separately. Refund rows
   in the by-order report do not count as duplicate purchasers; conflicting
   purchaser matches still require corrected exports.
5. If an imported name resembles an existing student, explicitly choose that
   student or **Create a separate new student**. Carve never establishes an
   identity from a name alone.
6. Select **Apply import**. Application runs in the background; you can return
   through **Resume a previous import**. Reapplying an accepted batch is safe.

An explicit paired return changes an imported registration to returned. A
student missing from a later export is not cancelled. Purchasers remain
purchasers; they are not automatically declared guardians. Existing grouping,
notes, and populated roster values are preserved.

Export all three reports using the same sale-date range and product filters.
The child listing determines which registrations are imported: newer purchases
present only in the purchaser or prompt reports do not create registrations.
Purchaser matching uses the child name, product, lesson date, price, and sale
date; prompt matching uses the child's Aspenware ID, product, lesson date, and
price. Re-upload files after an importer update to create a fresh preview; resuming
an old batch shows its stored reconciliation results.

## Connect parent surveys

Open **Review surveys**. A unique normalized first and last name can link
automatically even when the imported student has no birthdate. Duplicate names
require a unique matching guardian email or human review. Conflicting known
birthdates require review. Checks run when a response arrives and after import
application. Use **Check matches again** to process existing unmatched responses
after this matching update or later roster corrections. Confirmed links stay intact.

Aspenware does not supply a birthdate in the supported exports. A clear automatic
match links the response and fills the student's missing birthdate in one step.
No confirmation or sync action is needed. Existing links are backfilled during
deployment, and **Check matches again** can repeat the backfill safely. Existing
student birthdates are preserved, and conflicting linked answers stay unresolved.
For an uncertain response, compare the child and family information, choose the
student, and select **Confirm student match**; the same automatic fill then runs.

Optionally select **Fill missing registration discipline and ability**, choosing
the program whose registrations should be completed. This preserves populated
values. A differing registered discipline prevents a survey from filling an
unrelated discipline's ability level. Medical answers stay in the restricted
survey inbox; they are not optimizer input.

## See who is signed up and when

Open **Students** and choose one program before loading registrations. Students
with several signups appear once for each signup in that program. The table
shows name, lesson day, time, ability level, age, and discipline. Times use AM/PM;
lesson date ranges and program/status columns are omitted.

Age is calculated from the student's saved birthdate. It stays blank when no
reliable birthdate is available;
Aspenware age estimates are not substituted.

Use the day/time/status filters or expand **More filters** for cohort, discipline,
ability, age, missing information, and sorting. Filters apply to all rows before
pagination; choose 25, 50, or 100 rows per page. The matching registration and
distinct-student totals cover every filtered result, including other pages.
Combine filters to count, for example, Level 3 students on Sunday at 10 AM.

Click anywhere in a row (or focus it and press Enter/Space) to edit immediately
in a modal. **Save changes** enables only when values change. Saving closes the
modal and returns to the same filtered list. Discipline and level changes apply
to the selected registration; the student's profile and guardian information are
shared across their registrations. **Archive student** requires confirmation
and archives all that student's registrations while retaining audit history.

Session 1/2 remain separate cohorts. Imported weekend AM/PM/Full Day hours stay
visible before a matching session is configured. Those registrations still need
session review before grouping.

**Instructors** uses the same immediate editing modal and pagination controls.
Search or filter by discipline to see the total matching instructors across all
pages. Open a row to edit contacts, disciplines, and notes or review audit history.
Save enables after changes and returns to the list. **Archive instructor** is
available inside the modal and requires confirmation.

## Build groups

1. Open **Build lesson groups** and select the season and program.
2. Review **Needs info**. Confirm imported lesson sessions before asking for
   suggestions. Choose the actual day and time at the top, select a student,
   and confirm the mapping. The checkbox can apply the same decision to other
   unplaced students with the identical imported day/session evidence. Existing
   reviewed mappings and placed students are protected.
3. Select **Create draft** for suggested groups. **Start with empty groups** is
   also available. Registrations without imported schedule evidence use the
   day/time explicitly selected above the board.
4. Review the student queue and group cards. The queue's placement counts cover
   the whole program, including sessions outside the visible board. Search by
   name, filter discipline, or switch between all students and students needing
   information.
5. To place or move a student, select their card, then **Place student here** on
   the destination group. To remove a placement, select the student in their
   group and choose **Return to needs placement**. **Undo last move** reverses
   the latest move. Explain an age-band exception in the placement note.
6. Open a group's settings for lesson details, lead instructor, assistants,
   and notes. Group cards show capacity and missing leads. The instructor
   overview shows assignments overlapping the selected session.
7. After importing new arrivals or resolving missing information, use
   **Suggest remaining placements**. Existing placements are retained;
   compatible open groups are filled first, then new groups are suggested
   where qualified instructors are free.
8. **Submit for approval**. An administrator can **Return for changes**, approve,
   and then publish. Review every session and the unplaced count first.

Moves save immediately. Group detail and instructor forms have explicit Save
buttons. If a concurrent edit causes a conflict, reload the latest changes and
retry the intended move. Publication creates stable group numbers and dated
lessons. The published board remains visible and read-only.

## Current operating limits

- The initial rule set caps groups at six students and targets four. Ability is
  a preference; discipline, capacity, and overlapping assignments are enforced.
- Instructor availability reflects draft assignments. Staff working-hour and
  leave availability are not yet modeled. Confirm the staffing plan separately.
- Numbered sessions cannot be mapped into the regular season or another cohort.
  They remain separate while dates are pending, and the same instructor can
  teach both cohorts. Before publication, enter the actual date ranges and any
  no-lesson dates in **Time slots**. The two cohorts' ranges must not overlap.
  Calendar edits return submitted/approved drafts to editing for fresh review.
- The verified Saturday/Sunday AM, PM, and Full Day hours can match automatically
  to a unique configured session. Full Day conflicts with both AM and PM.
  Other unresolved source labels still require reviewed mapping.
- Published session settings are locked so a later time/calendar edit cannot
  silently alter existing lessons.
- Birthdates are not invented from Aspenware age. Missing or conflicting
  information remains visible for review.
- Changes to published recurring groups require a future revision workflow.
  Do not create a second overlapping published schedule as a workaround.
- The real-data policy and cutover gates in the release runbook still apply.

## Hosting imports

Configure a private Vercel Blob store, `BLOB_READ_WRITE_TOKEN`, and Workflow for
deployed imports. CSVs and ZIPs upload directly to private Blob using short-lived,
single-file, size-limited client tokens. File contents are validated server-side
before queuing. Workflow steps receive identifiers, not CSVs or survey answers.
Local development without Blob uses private filesystem storage instead.

Each upload is limited to 10 MB; a ZIP contains at most three supported CSVs,
each limited to 10 MB after decompression. Failed reconciliation can be retried;
a stale queued/processing batch can be restarted after ten minutes. Production
retention/cleanup and a real Blob/Workflow rehearsal still need verification.
