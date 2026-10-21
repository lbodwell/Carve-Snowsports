# Data ownership and access

## Ownership

| Data                                     | Authoritative system          | Carve behavior                                                                           |
| ---------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| Student identity and registration fields | External registration reports | Import and reconcile; do not silently overwrite local operational data.                  |
| Instructor identity/profile fields       | Carve initially               | Maintain with audit history; import adapters may later establish field ownership.        |
| Grouping and lesson operations           | Carve                         | Coordinators draft, administrators approve, and all published changes are audited.       |
| Attendance and dated lesson notes        | Carve                         | Record against a lesson instance.                                                        |
| Pricing/product data                     | External registration system  | Preserve source snapshots only when operationally needed; Carve is not a billing system. |

Parent survey answers remain attributed intake evidence. Confirmed identity
links are persisted separately from suggestions and are never silently rematched.
An authorized reviewer can explicitly fill a missing birthdate and missing
program-specific discipline/ability from a response; populated values survive.
Purchaser contacts are not automatically interpreted as guardian relationships.

`registrations.source_snapshot.groupingSchedule` is a Carve-owned reviewed
mapping of imported session evidence. Reimports preserve it, along with draft
and published placements. Mapping one import cohort does not overwrite another
reviewed mapping or an already placed registration.

## Sensitive information

Student health/support records, emergency contacts, addresses, and guardian
contacts are sensitive. They are:

- projected server-side according to role;
- excluded from application telemetry and test fixtures;
- logged only as field-category audit events, never as values;
- retained and deleted according to the policy that must be approved before
  production data is loaded.

Instructors see only their assigned lesson-instance roster, need-to-know
safety/support flags, and the approved emergency contact projection. They do
not receive unrestricted family profiles or operational notes.

## Roles

| Role        | Capability                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Admin       | Configure the organization, invite staff, approve/publish grouping, and view operational records.         |
| Coordinator | Manage people and registrations, generate and edit drafts, submit them for approval, and operate lessons. |
| Instructor  | View assigned lesson instances, use the restricted roster, and record attendance.                         |

No public registration or family portal is in launch scope.
