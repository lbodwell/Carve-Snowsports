# Test and release strategy

| Layer       | Required coverage                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Domain      | Calendar generation, time overlaps, grouping hard constraints, deterministic output, draft version conflicts, CSV shape validation. |
| Application | Authorization matrix, audit creation, transactional publication, sensitive-field projection, import idempotency.                    |
| Database    | Migrations apply to an empty database and representative repository transactions roll back safely.                                  |
| Browser     | Coordinator grouping, approval/publish, instructor attendance, import preview, and responsive keyboard paths.                       |
| Operations  | Backup restore, cutover rehearsal, migration recovery, and production health.                                                       |

Fixtures are synthetic only. No real names, contacts, medical/support values, or
raw imports may enter source control, snapshots, logs, or browser telemetry.
