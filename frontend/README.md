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
to silently switch to another port. The page displays cinema names returned by
`GET /api/cities`; it does not contain a hardcoded list of locations.

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

`npm run format` applies formatting. The eight focused API-client tests use
Node's built-in runner and a temporary HTTP server, without database credentials.
They verify envelopes, HTTP errors, non-JSON errors, empty responses and aborts.
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

## Boundaries and scope

- `src/pages/HomePage.jsx` composes the customer page.
- `src/features/cinemas/` contains the cinema list and its API service.
- `src/shared/services/apiClient.js` owns the configurable API base, GET
  transport, response envelopes and cancellation forwarding. Feature services
  use this client; shared modules do not import feature internals.
- `src/styles/global.css` contains the customer's black, red and gold theme.
- React owns local request state. Requests are aborted on cleanup so a discarded
  request cannot replace the active result. Failed requests have an explicit
  retry action. No global store or routing dependency is needed for this page.

This is #37's foundation, not completed customer browsing. It has no staff app,
checkout/account pages, city selection, screen/movie/showtime selectors, seating
or booking controls. Those features belong to the separate backlog items.

## Verification

Verified on 13 November 2026 with the real M0 development database:

1. The app rendered Oulu and Tampere through React → shared API client → Vite
   proxy → Express → PostgreSQL.
2. Stopping Express and reloading displayed an error with a working retry button.
3. Restarting Express and clicking “Try again” restored both cities.
4. The browser showed the requested black, red and gold theme. A skip link,
   semantic headings/lists and keyboard focus styles are implemented.
5. Install, lint, format checks, eight API-client tests and the production build
   passed. This does not certify complete keyboard or assistive-technology access
   for the future selection workflow; that remains part of its implementation.
