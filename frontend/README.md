# RIO customer application

React with JavaScript and Vite. Requires Node.js 22.13 or later in the Node 22
release line (verified with 22.14.0). Dependencies are separate from `backend/`.

## Run locally

Start the isolated PostgreSQL instance and Express backend using the
[database guide](../database/README.md). The backend should listen on port 3000.
In another terminal, from the repository root:

```bash
cd frontend
npm ci
cp -n .env.example .env
npm run dev
```

Open `http://127.0.0.1:5173/`. The development server uses a fixed port and refuses
to silently switch to another port. The page uses real city, screen and screening APIs. Choose a city, a screen,
a movie and a showtime to see the complete screening summary.

`VITE_API_BASE_URL` defaults to `/api`. The Vite development proxy forwards that
path to `http://127.0.0.1:3000`; the browser makes same-origin requests. If you
change the backend port, update the proxy in `vite.config.js`, or set the public
API base URL explicitly, including `/api`. With a direct API URL, configure the
backend's `FRONTEND_URL` to the actual browser origin so CORS permits it.

Vite exposes `VITE_` configuration to the browser and embeds it during a build.
Only public API configuration belongs here; database credentials remain in the
backend. See [Vite environment documentation](https://vite.dev/guide/env-and-mode).

## Build and checks

```bash
npm run lint
npm run format:check
npm test
npm run build
npm run preview
```

`npm run format` applies formatting. `npm test` runs both suites:

- `npm run test:unit`: 20 Node tests for transport and pure selection rules.
- `npm run test:components`: 19 Vitest/Testing Library tests in a simulated DOM,
  with controlled HTTP responses for loading, empty data, retry, focus and races.

No database credentials are needed for frontend tests. The test dependencies are
only development tools and are not included in the customer production bundle.
The production bundle is generated in ignored `dist/`.

`npm run preview` serves the built bundle locally on port 4173. Vite's local
preview inherits the development proxy; this is not production hosting. In
production, route `/api` to Express through the hosting configuration, or set
`VITE_API_BASE_URL` to the deployed API URL **before** building and configure
backend CORS. The nginx Docker scaffold does not yet configure an API proxy;
deployment routing remains #67. Its builder now uses Node 22 to match this app.
Docker execution was not verified on this machine.

ESLint 10 currently brings a vulnerable minimatch 10 dependency. A temporary
`minimatch` override selects the patched 11.x version; linting was verified with
that resolution and `npm audit` reported zero findings. Review/remove the
override when ESLint adopts a patched dependency directly. The dependency issue
is described in [the upstream advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Screening selection (#54)

Choose City → Screen → Movie → Showtime. The controls use database IDs returned
by the APIs; labels and positions are not identities. Both cities and both
100-/200-seat capacities work with the current M0 fixtures.

- City choices come from `/api/cities`.
- Screen choices come from `/api/screens?cityId=...` and must match the city.
- Movies and showtimes come from
  `/api/screenings?cityId=...&screenId=...`. Eligible movies are derived from
  future screenings, grouped by `film_id`; unrelated and past screenings are
  excluded. No movie catalogue is hardcoded or fetched independently.
- Changing city clears screen, movie and showtime. Changing screen clears movie
  and showtime. Changing movie clears showtime. Choosing the same parent retains
  a valid selection.
- The summary is shown only when all four choices match current data and the
  screening is future. It identifies city, screen capacity, movie and showtime.
  Selection is local page state; reloading clears it. It creates no hold/booking.
- Native labelled selects support keyboard navigation. Dependent controls stay
  disabled until their prerequisites and data are available. The summary is a
  polite live region and showtimes are explicitly labelled as Helsinki time.
- `Intl.DateTimeFormat` uses `Europe/Helsinki` for all displayed dates/times,
  including winter/summer offsets. The backend must keep the existing Helsinki
  convention described in the [API contract](../docs/API-SCREENINGS.md).
- Expired showtimes are excluded; the view checks time every 30 seconds and again
  when a showtime is selected. No server availability or allocation is implied.

If old fixtures no longer contain future screenings, run
`npm run db:seed:browsing` from `backend/` against the isolated development
database, then reload. This appends needed future screenings and keeps history.

### Boundaries

`src/pages/HomePage.jsx` composes the page. `features/cinemas/services/` owns
city/screen API operations. `features/screenings/` owns the selection component,
request hook, screening service, and pure selection/reset rules. All services use
`shared/services/apiClient.js`. The black, red and gold theme remains in
`src/styles/global.css`.

The old standalone `CinemaLocations.jsx` list and its unused styles were removed
because the selectors replace it. No checkout/account/staff pages or empty
feature scaffolding were added. Request state is local; abandoned requests are
aborted and their results ignored. Data from a previous request identity is
hidden immediately when a parent choice changes. Loading, empty and error
feedback plus retry are present as needed for these controls. #25 adds controlled
failure, retry, focus and out-of-order response coverage as described below.

### Verification

Verified on 13 November 2026 against the actual M0 PostgreSQL development data:

- Browser journeys selected valid screenings in Oulu and Tampere on each capacity.
- City/screen/movie changes cleared their dependent controls and completed summary.
- Tab followed City → Screen → Movie → Showtime; arrow keys and Enter selected
  a showtime. The selected values and summary matched the real API records.
- Twenty frontend unit tests passed: eight transport tests and twelve selection tests
  covering the complete city/capacity matrix, resets, eligible movies, ID-based
  deduplication, chronological sorting, expired/incompatible selections and
  Helsinki winter/summer/next-day formatting.
- ESLint, Prettier and the production build passed. These checks do not certify
  every browser, mobile breakpoint or assistive technology.

[Recorded browser evidence](verification/screening-selection.json) contains the
actual selected IDs, summaries, resets and keyboard checks. Run `npm test`,
`npm run lint`, `npm run format:check` and `npm run build` to repeat code checks.

Seat selection, prices, holds, payment, cross-page context and back navigation
remain their separate items. A successful summary does not mean seats are reserved.

## Browsing request states (#25)

Each request belongs to its current loader and retry attempt. Changing city or
screen immediately hides data from the previous context; cleanup aborts the old
request and ignores its eventual success or failure even if the transport ignores
cancellation. Movie changes filter already-loaded screenings locally and do not
launch another request.

- Pending controls expose `aria-busy`, announce loading and keep invalid downstream
  controls disabled. A new parent context starts fresh rather than inheriting an
  old retry label.
- Empty city/screen data and empty or past-only screenings have dedicated messages.
  The existing backend uses `404` with `No cities found` for an empty city table;
  only that documented error is normalized to an empty list. Other 404s and
  network/server failures remain errors.
- Failed reads offer a clearly named retry action. While retrying, the same button
  remains focused and `aria-disabled` blocks duplicate activation. After success
  it remains as “Refresh” for the current context so focus is not lost when the
  status changes. Shift+Tab returns to its associated selector.
- Retry does not select a different city, screen, film or showtime. Existing IDs
  remain usable only if they still match eligible current data; otherwise controls
  and the summary show no completed selection.
- City/screen/movie changes retain focus on the control the user changed and clear
  its downstream choices. No automatic focus jumps are introduced.

The component suite exercises slow old responses arriving after current ones,
late failures, unmount and React StrictMode cleanup, empty results, successful and
repeated failed retries, duplicate retry blocking, and focus through changes.
The deferred test transport deliberately ignores AbortSignal so these tests prove
that late completions cannot overwrite the current state. Dates for future test
screenings are generated relative to the test run.

[Request-state verification](verification/browsing-request-states.json) records a
real backend outage, failed retry, backend restart, recovery without automatic
selection, preserved keyboard focus and a completed Tampere screening summary.
Those checks used the actual local Express/PostgreSQL development data. The
controlled slow/empty cases run in component tests without changing the database.

Verified commands: `npm ci`, `npm test`, `npm run lint`,
`npm run format:check`, and `npm run build`. Complete browser/device accessibility
coverage, seat availability and booking are separate work. The DOM test tools
are configured through [Vitest](https://vitest.dev/guide/) and
[Testing Library](https://testing-library.com/docs/react-testing-library/setup/).
