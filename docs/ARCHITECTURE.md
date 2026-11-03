# RIO — Repository Architecture

RIO uses a **feature-based monorepo**: frontend and backend code share one repository, while related functionality is grouped by business feature within each application. Routes, controllers, services, and database access may form layers _inside_ a backend feature; they are not separate top-level collections for every feature.

This document explains where code belongs and the intended application boundaries. It describes the target architecture; not all directories or features exist yet.

## 1. Technology and deployment direction

| Area                | Agreed direction                         |
| ------------------- | ---------------------------------------- |
| Frontend            | React with JavaScript (`.jsx` and `.js`) |
| Backend             | Node.js with Express                     |
| Database            | PostgreSQL hosted at CSC (csc.fi)        |
| Application hosting | Microsoft Azure                          |

The frontends and Express backend will be hosted on Microsoft Azure, while PostgreSQL will be hosted separately at [CSC](https://www.csc.fi/). This choice uses the team's free CSC database access and avoids consuming its limited Azure allocation for database queries. The Express backend connects to PostgreSQL at CSC; the frontends access data through the backend API.

One repository does not require one deployment or an npm workspace. Keep frontend and backend dependencies in their own `package.json` files initially. Introduce root-level tooling only when it solves a concrete need.

## 2. Proposed structure

**The following is a target directory tree.** Optional directories should remain absent until needed.

```text
RIO/
├── frontend/                       # Customer React application
│   ├── public/                     # Assets served without source imports
│   ├── src/
│   │   ├── assets/                 # Imported images, fonts, icons
│   │   ├── features/
│   │   │   ├── movies/
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   ├── services/
│   │   │   │   └── utils/         # Only when feature helpers are needed
│   │   │   ├── cinemas/
│   │   │   ├── screenings/
│   │   │   ├── bookings/
│   │   │   └── payments/
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   ├── contexts/          # Cross-feature providers, if needed
│   │   │   ├── constants/
│   │   │   └── utils/
│   │   ├── pages/                # Route-level composition
│   │   ├── layouts/
│   │   ├── routes/
│   │   └── styles/
│   └── tests/
├── admin-frontend/                 # Future, separately deployed staff React app
├── backend/
│   ├── src/
│   │   ├── features/
│   │   │   ├── movies/
│   │   │   ├── cinemas/
│   │   │   ├── screenings/
│   │   │   ├── bookings/
│   │   │   └── payments/
│   │   ├── config/
│   │   ├── middleware/
│   │   └── utils/
│   └── tests/
├── database/
│   ├── migrations/                # Ordered, version-controlled schema changes
│   └── seeds/                     # Development/test reference data
└── docs/
```

The product backlog requires separate customer and staff websites, deployed separately. `frontend/` and the proposed `admin-frontend/` express that boundary; the staff app can use the same feature-based organization. Its creation is future work. Both applications may use the same backend, with authorization enforced by the backend. A hidden staff route or separate website is not an authorization mechanism.

## 3. Responsibilities and dependency boundaries

### Frontend

| Location                         | Responsibility                                                      |
| -------------------------------- | ------------------------------------------------------------------- |
| `features/<feature>/components/` | UI specific to one business feature                                 |
| `features/<feature>/hooks/`      | Feature state, effects, and reusable React behavior                 |
| `features/<feature>/services/`   | Feature API operations; use the shared API client                   |
| `features/<feature>/utils/`      | Pure feature-specific transformations and calculations              |
| `shared/components/`             | UI reused across features, such as buttons and loaders              |
| `shared/hooks/`                  | Hooks that do not depend on a specific feature                      |
| `shared/services/apiClient.js`   | API base URL, request transport, and common response/error handling |
| `shared/contexts/`               | Providers for genuinely shared React state, when required           |
| `pages/`, `layouts/`, `routes/`  | Compose feature UI into screens, layouts, and navigation            |
| `styles/`, `assets/`, `public/`  | Global styling and static resources                                 |

Pages compose features; shared code must not import feature internals. Keep local UI state local. Add context or other state tooling only when several consumers need it. Move code into `shared/` after there is an actual shared use case, rather than in anticipation of one.

### Backend

| Location                        | Responsibility                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `features/<feature>/*Routes.js` | Map HTTP methods and paths to middleware and controllers                                            |
| `*Controller.js`                | Read validated request input, invoke services, and send HTTP responses                              |
| `*Service.js`                   | Apply business rules and coordinate operations and transactions                                     |
| `*Repository.js`                | Execute parameterized SQL and map database results                                                  |
| `config/`                       | Read and validate environment configuration; initialize the database pool                           |
| `middleware/`                   | Shared request processing: authentication, authorization, validation, logging, and errors as needed |
| `utils/`                        | Small backend helpers with no HTTP or feature-specific responsibility                               |
| `app.js`                        | Configure Express, body parsing, routes, and final error handling; export the app without listening |
| `server.js`                     | Load startup configuration, start the server, and close server/database resources on shutdown       |

The usual dependency direction is **route → controller → service → repository → PostgreSQL**. Keep business rules out of controllers and SQL out of React and controllers. A feature-specific validator or middleware can remain within its feature. Put only cross-cutting middleware in the shared backend directory.

Services may call another feature's service through a deliberate interface. Avoid importing another feature's controller or repository directly. Use focused functions by default; feature-based organization does not require classes, inheritance, dependency-injection frameworks, or a microservice per feature.

### Database and external integrations

`database/` contains schema migrations and seed data, not a running database or database credentials. The runtime PostgreSQL connection belongs in `backend/src/config/`; queries belong in feature repositories. Choose a migration tool when database work starts and document its commands in the README.

Use database constraints and transactions alongside service validation to preserve consistency. For bookings, concurrent requests must not be able to allocate the same place twice; checking availability in React is insufficient. The exact seat-hold and expiry strategy remains a design task.

Payment-provider calls and event handling belong in the backend payments feature. Provider secrets stay on the server. The backlog permits a temporary payment simulation while integration is pending; simulation must remain distinguishable from confirmed provider payment. Do not treat a browser redirect as proof of payment.

## 4. Application data flow

The following flow is proposed, using movie browsing as an example. `/api/movies` is an illustrative endpoint, not a verified existing route.

```text
Customer or staff browser
  → React page / feature component
  → useMovies hook (loading, data, error state)
  → movieService → shared API client
  → HTTP request to Express /api/movies
  → applicable request middleware
  → movieRoutes → movieController → movieService
  → movieRepository → PostgreSQL
  ← query result → service result → JSON HTTP response
  ← API client → hook state update → React renders
```

Frontend validation gives immediate feedback. Backend validation and authorization remain authoritative, including for requests that bypass the UI. Controllers should return suitable HTTP statuses and consistent JSON errors. Unexpected failures should reach the centralized error handler without exposing database details or secrets.

For a booking, the service must recheck availability, pricing, and seat-selection rules against current server data and commit related database changes atomically. When provider integration is implemented, verified payment events should update booking/payment state idempotently so retries do not duplicate effects. Document the concrete API contracts and payment state transitions as these features are implemented.

## 5. React hooks versus Express middleware

| Aspect           | React hooks                            | Express middleware                              |
| ---------------- | -------------------------------------- | ----------------------------------------------- |
| Runs in          | The React application                  | The backend request/response pipeline           |
| Purpose          | Share stateful UI behavior and effects | Process requests before/around route handlers   |
| Examples         | `useMovies`, shared `useDebounce`      | Request validation, role checks, error handling |
| Typical location | Feature `hooks/` or `shared/hooks/`    | Feature-local files or backend `middleware/`    |

Call hooks at the top level of React function components or custom hooks, not inside conditions, loops, or ordinary service functions. A custom hook name starts with `use`.

Middleware receives `req`, `res`, and `next`; it either completes the response or passes control onward. Express error middleware has four parameters: `(err, req, res, next)` and is registered after routes. Preserve raw request data for payment-signature verification if the chosen provider requires it; account for this when ordering body parsers.

Hooks and middleware solve different problems and do not replace each other. Ordinary API helpers, SQL repositories, and business functions are neither React hooks nor Express middleware.
