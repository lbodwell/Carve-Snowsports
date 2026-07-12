# Launch journeys

## Coordinator: build groups

1. Choose a season and program.
2. Review import reconciliation and unresolved registrations.
3. Generate a deterministic grouping draft.
4. Review unplaced registrations, capacity, qualification, and support review
   warnings.
5. Move registrations with keyboard, click, or drag-and-drop; provide a reason
   for material overrides.
6. Submit the draft for approval.

Success: no hard-rule violations remain, every unplaced registration has an
explanation, and each edit is autosaved with conflict recovery.

## Administrator: approve and publish

1. Review the submitted draft, ruleset version, warnings, and overrides.
2. Approve or return it with a comment.
3. Publish the approved version.

Success: publication is idempotent and transactional, creates stable numbered
groups and dated lesson instances, and writes an audit event.

## Instructor: operate a lesson

1. Open today's assigned lesson instance.
2. Review the restricted roster and need-to-know safety/contact context.
3. Record present, absent, late, or excused attendance and an optional note.

Success: an instructor cannot view other groups or unrestricted student
profiles, and instance changes never alter future recurring memberships.
