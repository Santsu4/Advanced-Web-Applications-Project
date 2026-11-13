# RIO

RIO is a cinema booking web application being developed for Oulu University of Applied Sciences (OAMK)'s Advanced Web Applications Project (ID00CS47-3007).

The project aims to help customers browse screenings, choose seats, and purchase tickets, while providing staff with tools to manage cinema operations.

## Tech Stack

Planned technologies:

| Area                | Technology                                       |
| ------------------- | ------------------------------------------------ |
| Frontend            | React, JavaScript                                |
| Backend             | Node.js, Express                                 |
| Database            | PostgreSQL, hosted at [CSC](https://www.csc.fi/) |
| Application hosting | Microsoft Azure                                  |

## Contributing

Start with the [Contributing Guidelines](CONTRIBUTING.md) for contributor expectations and a checklist for submitting changes.

## Architecture

The [Architecture guide](docs/ARCHITECTURE.md) explains the planned application structure, component responsibilities, and data flow.

## Product Backlog

Explore the [Product Backlog](PRODUCT-BACKLOG.md) for planned features, priorities, acceptance criteria, and open decisions.

## Communication

Join the [RIO Discord server](https://discord.gg/jJTps5kC9F) for team discussions and coordination.

## Status

In development. Customers can choose a city, screen, movie and showtime using
live data. Seat selection and booking remain under development.

## Backend development

On the configured development machine, PostgreSQL data is retained in ignored
`.local/postgres`. Start it using the [database guide](database/README.md), then
run `npm start` from `backend/`. In another terminal, run
`npm run verify:browsing` from `backend/` to verify both cities and all four
screens against the running API. These commands use your ignored `.env`.

Requires Node.js 22 and access to a PostgreSQL development database. From the
repository root:

```bash
cd backend
npm ci
cp -n .env.example .env
# Edit .env with your development database connection and frontend origin.
npm test
npm run dev
```

`npm start` runs without the development watcher. `PORT` defaults to 3000.
`DATABASE_URL` must name a PostgreSQL database; `FRONTEND_URL` must be an
HTTP(S) origin such as `http://localhost:5173`. The old `CLIENT_URL` variable
is no longer used. Keep `.env` local and never commit real credentials.
Configuration is validated and database connectivity is checked before listening.
Stop with Ctrl+C; SIGINT/SIGTERM close HTTP connections and the database pool.

These commands do not create tables or seed records. An empty PostgreSQL database
can pass the connectivity check, but data endpoints require the schema and data.
For repeatable isolated schema setup, read the [database guide](database/README.md).
Install the synthetic browsing data with `npm run db:seed:browsing` after applying
the schema. Run `npm run test:postgres` for all tests against an explicitly
isolated local development connection. Do not apply `backend/db.sql` blindly
to a shared database.

`npm test` uses Node's built-in test runner and isolated HTTP servers with injected
database doubles. It checks configuration, existing route response contracts,
CORS, startup failures and shutdown; it does not prove a live schema is correct.
The two PostgreSQL integration checks run when `TEST_DATABASE_URL` is explicitly
set to a development connection URL before `npm test`; otherwise they are skipped.
They check real connectivity and a CLI request/shutdown without creating tables
or records. Schema migration tests additionally require
`TEST_MIGRATION_DATABASE_URL`; they create and remove dedicated test databases,
and require a local development role with `CREATEDB`. The database guide provides
a disposable PostgreSQL recipe and explains the migration target safeguards.

Application setup lives in `backend/src/app.js` and has no listening side effect.
Runtime orchestration lives in `backend/src/server.js`; `backend/server.js` loads
the environment and handles process signals. Shared configuration is in
`backend/src/config/`. Other prototype SQL/routes remain in `backend/api.js`, with the pool passed in
explicitly; screening reads now follow the feature layers in
`backend/src/features/screenings/`. See the [screening API contract](docs/API-SCREENINGS.md). New business logic should follow the feature
boundaries in the architecture guide as those features are implemented.

The existing Docker Compose/Kubernetes files remain deployment scaffolding:
the backend container entrypoint and database environment names need the runtime
integration tracked under #67. Use the commands above for this milestone.

## Customer frontend

Start the backend, then run the following in another terminal from the repository
root:

```bash
cd frontend
npm ci
cp -n .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173/`. See the [frontend guide](frontend/README.md) for
API configuration, build/lint/test commands and verified scope.
