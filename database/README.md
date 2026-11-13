# Development database schema

Schema setup for #39 uses a small Node.js migration runner built on the existing
`pg` dependency. It adds no runtime dependencies. Ordered SQL files live in
`database/migrations/`; commands run from `backend/`.

## Commands and target

Set `DATABASE_URL` in your local `backend/.env`, or export it in your shell.
Inspection needs only this variable; it does not require frontend configuration.

```bash
cd backend
npm run db:inspect
```

Inspection runs in a repeatable-read, read-only transaction. JSON output includes
public tables, columns/defaults, keys/check constraints, indexes, function and
trigger definitions, application row counts, PostgreSQL version and session
timezone. `missingTables` compares names with the eleven baseline application
tables. This is an inspection report, not an automatic proof of full schema
compatibility. Save a before/after report when applying a schema change.
It lists structure and counts, without retrieving customer records or printing
the connection URL. Large or inaccessible tables may make inspection fail; the
command makes no corrective writes.

To apply migrations, explicitly select an isolated **local development** target:

```bash
export RIO_DATABASE_MODE=isolated-development
npm run db:migrate:dev
npm run db:inspect
```

The write command requires a loopback host (`127.0.0.1`, `localhost`, or `::1`),
a database named `rio_dev` or `rio_test` (optionally followed by an underscore
and a lowercase letters/digits/underscores suffix), and no URL query or fragment.
Example: `postgresql://rio_dev:your-local-password@127.0.0.1:5432/rio_dev`.
It also checks the actual connected server address and database name before DDL.
The caller must ensure this is a dedicated development database. The command
does not create a database, provision roles or enable writes to the CSC database.

## Migration behavior

- `0001_initial_schema.sql` preserves the existing `backend/db.sql` definitions.
  The original file remains a historical source for existing links; use the
  migration command for new isolated databases. Do not run both setup paths.
- First application requires an empty `public` schema. An existing untracked
  schema is refused, even if its table names appear compatible. Inspect it;
  adoption of an existing database needs a separately reviewed migration plan.
- `public.rio_schema_migrations` records filenames, SHA-256 checksums and applied
  times. A rerun skips applied files, preserving records, IDs and sequences.
- Applied SQL files are immutable, including whitespace. Add the next unique
  four-digit version, such as `0002_description.sql`, for a schema change.
  Edited, removed or reordered history is rejected.
- An advisory transaction lock serializes runners for the database. All pending
  SQL and history records commit together; any SQL failure rolls back that batch.
  Lock waits are limited to five seconds and statements to thirty seconds.
- Files must contain transaction-compatible SQL. Do not include `BEGIN`, `COMMIT`,
  or operations such as `CREATE INDEX CONCURRENTLY`. There is no reset, automatic
  downgrade or production deployment migration command in this milestone.
- Checksums protect migration history. They do not detect manual changes to
  tables or triggers; use inspection and focused database checks for that.

## Reproduce verification with PostgreSQL 17

The following macOS recipe creates a new disposable local cluster. It does not
use an existing PostgreSQL service. Choose another unused port if 55439 is busy.
Run from `backend/`; if PostgreSQL is installed elsewhere, adjust `RIO_PG_BIN`.
The `trust` authentication here is only for this temporary loopback test cluster.

```bash
export RIO_PG_BIN=/Library/PostgreSQL/17/bin
export RIO_PG_DATA="$(mktemp -d /tmp/rio-schema.XXXXXX)"
"$RIO_PG_BIN/initdb" -D "$RIO_PG_DATA" -U rio_test -A trust --no-locale --encoding=UTF8
"$RIO_PG_BIN/pg_ctl" -D "$RIO_PG_DATA" -l "$RIO_PG_DATA/server.log" -o "-h 127.0.0.1 -p 55439 -k $RIO_PG_DATA" -w start
"$RIO_PG_BIN/createdb" -h 127.0.0.1 -p 55439 -U rio_test rio_test_migrations
export DATABASE_URL=postgresql://rio_test@127.0.0.1:55439/rio_test_migrations
export RIO_DATABASE_MODE=isolated-development
npm run db:inspect
npm run db:migrate:dev
npm run db:inspect
npm run db:migrate:dev
TEST_DATABASE_URL="$DATABASE_URL" TEST_MIGRATION_DATABASE_URL="$DATABASE_URL" npm test
"$RIO_PG_BIN/pg_ctl" -D "$RIO_PG_DATA" -m fast -w stop
```

After stopping it, the cluster files remain in the newly created `RIO_PG_DATA`
directory and may be removed when no longer needed. No real credentials are
needed for this disposable recipe. Keep real development credentials in ignored
`.env` files. Without the test connection variables, `npm test` runs the checks
that do not need PostgreSQL and explicitly skips the integration checks.

The migration integration test creates uniquely named `rio_test_schema_*`
databases, applies SQL, exercises constraints and drops only those test databases.
Its role needs `CREATEDB`; the temporary cluster role above has that permission.
Do not point test variables at a shared database.

## Verified scope and remaining work

[Recorded verification](verification/initial-schema.json) contains the read-only
before/after summary for a disposable PostgreSQL 17.0 cluster on 13 November 2026.
All 18 tests passed, with no skips. The checks verified all baseline columns,
13 foreign keys, nine check constraints, unique indexes and two enabled triggers.
A linked city → screen → screening → film example, with a booking/ticket,
survived a rerun with its records and IDs unchanged. Concurrent runners applied
once; failed SQL rolled back; altered history and untracked legacy schemas were
refused. The cluster used for that verification was stopped and removed.

This baseline is the existing schema, not the final seating design:

- Screening/booking timestamps remain `timestamp without time zone`; a session
  timezone does not turn them into unambiguous instants.
- Existing CEO triggers are present, and flagged-seat rejection is tested. Their
  known gaps (including ordinary-seat deletion suppression and seat relocation)
  remain for #36. Trigger presence does not prove the final CEO requirement.
- Physical columns, complete inventories and their safeguards remain #51/#36.
- No city, screen, movie or future-showtime fixtures are installed here. Durable
  local browsing data and live API workflow verification remain #52.
- Shared/CSC schema state has not been inspected or changed. Production adoption,
  rollout and database roles remain separate work.
