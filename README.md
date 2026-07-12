# Carve

Carve is a staff-only ski school operations application for turning seasonal
registrations into safe, explainable lesson groups.

## Status

This repository is the production rebuild. The legacy `carve` repository is a
read-only UX and domain reference; it is not deployed by this project.

## Local development

1. Copy `.env.example` to `.env.local` and provide a local Postgres connection.
   Set `TEST_DATABASE_URL` to the disposable local `carve_test` database.
2. Run `bun install`.
3. Run `bun run db:up`, then `bun run db:migrate`.
4. Optionally load the demo roster with `bun run db:seed`.
5. Start the app with `bun run dev`.

## Quality gates

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

## Local database tests

`bun run test:integration` recreates the local `carve_test` database, applies
every Drizzle migration, validates the resulting schema, then drops the
database. It only accepts a `TEST_DATABASE_URL` for `localhost`/`127.0.0.1`
with the database name `carve_test`, so it cannot run against the development
or production database.

## Architecture

- TanStack Start provides SSR, routes, and same-origin server functions.
- Drizzle is the database boundary for Neon Postgres.
- Domain rules are pure TypeScript under `src/domain`.
- Application services authorize and transact use cases under
  `src/application`.
- Feature UI must never import the database directly.

See `docs/` for product rules, the data model, security boundaries, imports,
testing, and operations.

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
