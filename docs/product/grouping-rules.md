# Grouping rule catalogue

This document is the versioned source of truth for the first production
grouping engine. Rules are evaluated against a season/program snapshot and the
rule-set version is stored on every generated draft.

## Terms

- **Registration**: a student's enrollment in a specific season/program.
- **Season group**: the durable, numbered group that represents the intended
  recurring placement.
- **Lesson instance**: one dated occurrence generated from a published season
  group.
- **Draft**: a private, editable proposal. It does not alter published groups.
- **Override**: a coordinator's explained departure from an engine
  recommendation or a soft rule.

## Hard constraints

The engine must never knowingly violate these rules.

| Rule                     | Initial behavior                                                           |
| ------------------------ | -------------------------------------------------------------------------- |
| Enrollment compatibility | A registration belongs to the selected program and is active.              |
| Student availability     | Every required recurring time slot is available.                           |
| Instructor availability  | The assigned instructor is available for the group time.                   |
| Qualification            | The instructor holds the required discipline/program qualification.        |
| Capacity                 | Group size and configured instructor-to-student limits are not exceeded.   |
| Separation request       | A configured must-separate relationship is not placed together.            |
| Time conflict            | A student or instructor is not assigned to overlapping actual time ranges. |

## Soft scores

Soft rules generate explanations, not automatic blocks.

| Rule              | Intent                                                          |
| ----------------- | --------------------------------------------------------------- |
| Ability proximity | Prefer a group aligned to the student's recorded ability level. |
| Age cohesion      | Prefer peers with compatible age-band placement.                |
| Instructor fit    | Prefer stated instructor qualification and preference matches.  |
| Together request  | Prefer configured sibling/friend placement together.            |
| Balance           | Prefer balanced group sizes.                                    |
| Continuity        | Prefer retaining a prior approved assignment where relevant.    |

## Safety and support information

Restricted medication, allergy, and support records never enter the optimizer.
They can create a visible coordinator review warning when policy requires it.
Only authorized staff can read the underlying details.

## Publication rule

A group may be incomplete while drafting. An approved group must have a lead
instructor before publication. Publication reruns every hard constraint in a
single transaction and creates dated lesson instances.
