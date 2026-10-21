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

`test:e2e` builds and serves the production Node artifact on port 3101, using
the launcher's database and auth secret. It does not reuse a developer server.
Use a synthetic, disposable database: the ordered administrator scenarios
create imports, survey responses, drafts, published groups, and cohort settings.
They cover the full import/review/group/publication journey and configuring
Session 1/2 separately before dates are known. Login throttling remains enabled;
configuration reuses the administrator session already verified in the suite.
Failed runs retain Playwright traces for diagnosis. CI's E2E step includes the
production build, so a second unchanged build is unnecessary.
