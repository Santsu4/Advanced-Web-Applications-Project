# RIO Seating Integration

## Status and scope

Reviewed on 8 November 2026 against local commit
`718e8887c2cab545567a6521e9c0def3793c4ca4`.

This document covers seating for 100-seat and 200-seat screens and its
integration with screening and booking features. It changes no application code.

- **Implemented in source:** behaviour found in the checked-out JavaScript.
- **Schema support:** definitions in `backend/db.sql`, not proof that a running
  database has applied them or contains valid inventory.
- **Required by backlog:** agreed rules in [PRODUCT-BACKLOG.md](PRODUCT-BACKLOG.md).
- **Proposed:** contracts and implementation choices for team review.
- **Open:** decisions that still require agreement.

The review was static. No server, deployed API, or live database was queried.
`backend/api.http` contains manual request examples, not verified test results.

Source references for maintaining this document:

| Source | What to recheck when it changes |
| --- | --- |
| [API handlers](../backend/api.js) | Existing requests, response fields, availability queries and errors. |
| [Server](../backend/server.js) | Registered routes, middleware and runtime configuration. |
| [Database schema](../backend/db.sql) | Inventory fields, booking states, constraints and CEO triggers. |
| [Manual API requests](../backend/api.http) | Examples available to integration developers. |
| [Product backlog](PRODUCT-BACKLOG.md) | RIO-01, RIO-07–09 and open decisions O-02/O-07/O-09. |

These links assume this file is saved as `docs/SEATING-INTEGRATION.md` in RIO.

## 1. Existing implementation

Routes and SQL currently live together in `backend/api.js`.
`backend/server.js` configures Express JSON parsing and CORS, registers routes,
and listens on `PORT` or 3000. The PostgreSQL pool uses `DATABASE_URL`.
No authentication, authorization, booking writes, expiry worker, or seating
validation service is registered. `frontend/` contains a Dockerfile but no
tracked React source or package manifest.

### Read APIs implemented in source

Success responses use `{ "success": true, "data": ... }`. Handled failures use
`{ "success": false, "error": "message" }`. Current responses mix database
snake_case fields with calculated camelCase seat flags.

| Request | Current result and relevant behaviour |
| --- | --- |
| `GET /api/cities` | City rows; returns 404 if the table is empty. |
| `GET /api/cities/:id` | One city; 404 if absent. |
| `GET /api/screens?cityId=1` | Optional city filter; array of `id`, `capacity`, `wheelchair_capacity`, `city_id`, `city_name`, ordered by screen ID. |
| `GET /api/screens/:id` | One screen with the same fields; 404 if absent. |
| `GET /api/films` | Film rows from `SELECT *`. |
| `GET /api/films/:id` | One film; 404 if absent. |
| `GET /api/screenings?cityId=1&filmId=1` | Either filter or both; returns `id`, `screening_time`, `film_title`, `screen_id`, `city_id`, `city_name`, ordered by time. There is no single-screening route. |
| `GET /api/seats?screenId=1&screeningId=1` | `screenId` required, `screeningId` optional. Returns all seat columns plus `isBooked` and `isReservedByCeo`, ordered by database seat ID. |
| `GET /api/prices` | Price rows; no pricing calculation. |
| `GET /api/bookings?screeningId=1` | Optional screening filter. Prototype explicitly marked not ready. Returns `booking_id`, `screening_time`, `film_title`, and an aggregated `seat_id` array. No status, expiry, ownership, or city access filtering. A booking without tickets can return `[null]`. |

All these handlers catch query failures and return 500 with a string error.
They do not validate IDs as positive integers first, so malformed IDs can reach
PostgreSQL and become 500 responses. Empty list queries generally return 200
with `[]`, except the cities behaviour above.

### Current seats contract

```http
GET /api/seats?screenId=1&screeningId=1
```

Illustrative response shape, not a captured response or verified seed data:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "screen_id": 1,
      "physical_row": 1,
      "row_label": 1,
      "seat_label": 1,
      "is_wheelchair": false,
      "is_ceo_reserved": true,
      "isBooked": false,
      "isReservedByCeo": true
    }
  ]
}
```

Implemented details and limitations:

- Missing `screenId` returns 400 with the exact message
  `screenId query parameter required`.
- A valid but unknown screen ID returns 200 with `[]`; screen existence is not
  checked. An unknown screening ID contributes no booked seats.
- `isBooked` means a ticket joins to a booking for the supplied screening.
  Booking status and expiry are ignored, including `expired` bookings.
- Without `screeningId`, all returned seats have `isBooked: false`. This is
  inventory data and must not be treated as screening availability.
- The screen and screening are queried independently. A screening from another
  screen is accepted and can misleadingly show seats as free.
- `isReservedByCeo` is true for global database ID 1 or a true
  `is_ceo_reserved` flag. It does not check `seat_label === 1` per screen.
- Seat ID ordering does not establish physical left-to-right ordering.
- No seat-selection, adjacency, capacity, hold, or concurrency logic is present.

## 2. Existing database support and gaps

These are source schema definitions only. There are no tracked inventory seeds
or migrations. The reviewed Compose and PostgreSQL deployment definitions do
not mount `db.sql` as an initialization script.

| Table or mechanism | Schema support | Missing enforcement or risk |
| --- | --- | --- |
| `cities`, `screens` | Screen belongs to a city; capacity restricted to 100 or 200; wheelchair capacity defaults to 10. | Default 10 does not enforce exactly ten spaces. No constraint or seed guarantees the required four screens or correct inventory counts. |
| `seats` | Screen FK, `physical_row`, integer row/seat labels excluding 13, wheelchair and CEO flags. | No physical column, unique position/label per screen, positive row/label checks, or requirement for one protected seat per screen. |
| `screenings` | Film FK, screen FK, `screening_time`. | Time is `TIMESTAMP` without timezone. No API validation of seat-to-screening membership. |
| `bookings` | Screening FK, user/guest contact constraint, status enum-like check, booking time and nullable expiry. | Status values alone do not implement transitions or expiry. No hold ownership token, request idempotency, or allocation locking. |
| `tickets` | Booking and seat FKs, optional price FK, charged amount and loyalty flag. | No screening-specific seat uniqueness, no cross-screen seat check, no prevention of duplicate seat tickets in a booking. |
| `prices` | Adult, child and company categories with amounts in cents. | No wheelchair category or authoritative calculation/quote flow. |
| `company_requests`, `invoices` | Request decision fields; invoice linked to booking with separate `is_paid`. | No company acceptance/allocation transaction or invoice workflow. |
| `users` | Roles and optional permitted city. | Columns do not enforce HTTP authorization; existing routes have no access checks. |

### CEO triggers need correction before allocation is safe

`prevent_ceo_seat_booking()` rejects ticket inserts/updates only when the
referenced seat has `is_ceo_reserved = true`. Unlike the read API, it does not
protect global ID 1 unless that flag is set.

`protect_ceo_seat_config()` checks the old `seat_label = 1`, rather than a
screen-scoped immutable protected identity. It blocks deleting those rows and
some updates, but does not enforce correct flags on insert or stop a protected
seat moving to another screen/position. It returns `NEW` for deletes of other
seats; in a BEFORE DELETE trigger this is null and suppresses those deletes.
Document and fix these behaviours deliberately rather than treating the SQL
comments as proof of complete protection.

## 3. Required layouts and proposed inventory changes

The following rules come from the backlog, not the current route handlers.
Each city, Oulu and Tampere, requires one screen of each capacity.

| Property | 100-seat screen | 200-seat screen |
| --- | --- | --- |
| Physical seated rows | 10 | 20 |
| Seats per physical row | 10, uninterrupted block | 10, uninterrupted block |
| Displayed row labels | 1 through 10 | 1 through 12, then 14 through 21 |
| Seat labels | 1 through 101, excluding 13 | 1 through 201, excluding 13 |
| Additional wheelchair spaces | 10 | 10 |
| Ordinary seated capacity if CEO seat is included | 99, pending O-02 confirmation | 199, pending O-02 confirmation |

The screen appears at the bottom. Physical row 1 is nearest the screen, and
wheelchair spaces sit between row 1 and the screen. Hallways are outside the
seat block. Numbering snakes across rows, starting left to right in row 1.

| Physical row | Display row | Seat labels from left to right |
| --- | --- | --- |
| 1 | 1 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| 2 | 2 | 21, 20, 19, 18, 17, 16, 15, 14, 12, 11 |
| 3 | 3 | 22, 23, 24, 25, 26, 27, 28, 29, 30, 31 |

### Proposed generation and persistence

1. Generate physical positions, independently of labels. For seated rows use
   one-based `physical_row` and a new one-based `physical_column` (1 to 10).
2. For physical row `r`, use display row `r` below 13, otherwise `r + 1`.
   Assign the next ten seat labels, skipping 13 globally, then reverse their
   column assignment on even physical rows. Do not omit a physical row.
3. Protect seated label 1 in every screen using consistent server/database
   rules. Never use a global database ID as its business identity.
4. Proposed wheelchair representation: ten additional rows in `seats`, with
   `is_wheelchair = true`, positions in a separate wheelchair zone, and display
   identifiers such as W1 to W10. Identifiers are pending O-02. Existing integer
   labels and mandatory `physical_row` need an explicit migration; do not encode
   wheelchair spaces as an ordinary seated row or reuse duplicate seat labels.
5. Add zone-aware unique positions and unique display identifiers per screen,
   with positive/range checks appropriate to each zone. Preserve existing seat
   IDs referenced by tickets. Validate inventory counts in seed verification.
6. Apply versioned, repeatable migrations/seeds. Inspect existing inventory
   before changing it; do not regenerate seats used by bookings.

Static layout belongs to a screen. Availability belongs to a screening. Neither
the frontend nor a new feature should create a second source of seat inventory.

## 4. Proposed seating API contract

**Everything in this section is a proposal.** Keep the current read routes
working while coordinating contract changes with the teammate. Existing routes
retain their current snake_case response until an agreed migration. New DTOs
below use camelCase and stable database seat IDs.

### Read seating for one screening

```http
GET /api/screenings/1/seats
```

The server resolves the screen from the screening, removing the need for the
client to send two potentially conflicting IDs. Return a flat seat list with
explicit physical positions; the frontend groups and renders it. The shortened
example contains only two illustrative inventory entries.

```json
{
  "success": true,
  "data": {
    "screeningId": 1,
    "screenId": 1,
    "layout": {
      "seatedCapacity": 100,
      "wheelchairCapacity": 10,
      "physicalRows": 10,
      "columnsPerRow": 10,
      "screenPosition": "bottom"
    },
    "seats": [
      {
        "id": 1,
        "zone": "seated",
        "physicalRow": 1,
        "physicalColumn": 1,
        "rowLabel": "1",
        "seatLabel": "1",
        "status": "ceo_reserved"
      },
      {
        "id": 2,
        "zone": "seated",
        "physicalRow": 1,
        "physicalColumn": 2,
        "rowLabel": "1",
        "seatLabel": "2",
        "status": "available"
      }
    ]
  }
}
```

Proposed statuses: `available`, `held`, `reserved`, `booked`, `ceo_reserved`.
`booked` covers paid and company-invoiced allocations. Expired allocations must
not block seats. A wheelchair entry would use `zone: "wheelchair"`,
`physicalRow: null`, `rowLabel: null`, a zone-local `physicalColumn`, and an
agreed string identifier. The public response must not expose contact details
or another customer's booking/hold credentials. Browser selection is local UI
state, not a persisted seat status. A read response never guarantees allocation.

### Validate a selection without allocating it

```http
POST /api/screenings/1/seat-validations
Content-Type: application/json

{"seatIds":[2,3]}
```

```json
{"success":true,"data":{"screeningId":1,"seatIds":[2,3],"valid":true}}
```

This optional preview endpoint uses the same service as allocation. It creates
no hold and does not replace validation inside the allocation transaction.

### Create a checkout hold through booking logic

```http
POST /api/bookings
Content-Type: application/json
Idempotency-Key: <unique-client-request-key>

{
  "screeningId": 1,
  "guestEmail": "guest@example.com",
  "tickets": [
    {"seatId": 2, "category": "adult"},
    {"seatId": 3, "category": "child"}
  ]
}
```

Proposed success: 201. Ticket categories and charged amounts are checked and
calculated server-side. Authenticated user identity comes from the session,
never a trusted body `userId`. For guests, require the agreed contact fields.

```json
{
  "success": true,
  "data": {
    "bookingId": 42,
    "screeningId": 1,
    "status": "hold",
    "seatIds": [2,3],
    "expiresAt": "2026-11-08T12:10:00Z"
  }
}
```

The example expiry is illustrative, not an agreed hold duration. A successful
hold also needs an owner-bound session or opaque guest credential for later
retrieval/payment actions; its transport remains open. Idempotency requires
persisted request/result matching and rejection of key reuse with different
payloads. None of this exists in the current GET bookings route.

Pay-later reservations, staff allocation, company acceptance, payment, and
hold release must reuse the allocation service. Their route contracts remain
to be agreed; this document does not invent implemented write endpoints.

### Proposed error contract

Use one predictable envelope for the new endpoints. Current routes still return
string errors; moving them to this envelope requires coordinated client changes.

```json
{
  "success": false,
  "error": {
    "code": "SEATS_UNAVAILABLE",
    "message": "Some selected places are no longer available.",
    "details": {"seatIds": [3]}
  }
}
```

| HTTP | Proposed code | Trigger and expected handling |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Non-positive/non-integer ID, empty/duplicate seat list, malformed ticket/contact/category input. |
| 401 | `AUTHENTICATION_REQUIRED` | Account-only reservation or protected operation without authentication. Guest checkout remains allowed. |
| 403 | `FORBIDDEN` | Staff city/role or booking ownership restriction. |
| 404 | `SCREENING_NOT_FOUND` | Requested screening does not exist. |
| 422 | `SEAT_SCREEN_MISMATCH` | Seat does not exist in the screening's inventory. |
| 422 | `CEO_SEAT_PROTECTED` | Selection includes a permanently protected seat. |
| 422 | `ISOLATED_SEAT` | Selection creates a forbidden internal single-seat gap. Return affected physical positions. |
| 422 | `IMMEDIATE_PAYMENT_REQUIRED` | Pay-later request violates account, size, or timing rules, with 401 used for missing authentication. |
| 409 | `SEATS_UNAVAILABLE` | An active allocation already occupies a selected seat, including a concurrent winner. Refresh and reselect. |
| 409 | `HOLD_EXPIRED` | A payment/confirmation operation attempts to use an expired hold. Follow the agreed payment recovery policy. |
| 409 | `IDEMPOTENCY_CONFLICT` | Same key used for a different request body. |
| 500 | `INTERNAL_ERROR` | Unexpected failure; log details server-side and expose no SQL or secrets. |

## 5. Screening, booking, and frontend integration

### Reuse the existing browsing path

1. Use existing cities, films, and filtered screenings routes to choose a
   screening. Retain its `id` and `screen_id` from the response.
2. Until the proposed endpoint exists, call current seats with both matching
   IDs and use `GET /api/screens/:id` for capacity. This is a prototype bridge,
   not a safe checkout availability contract. Correct the current status and
   membership handling before relying on it for allocation.
3. Render explicit physical positions, with the screen at the bottom. Do not
   lay out seats by database ID or arithmetic on display labels.
4. Keep selected IDs locally. Show available, selected, and unavailable places
   with text/accessible labels as well as colour, with keyboard interaction.
5. Submit to booking allocation; refresh on a conflict and show expiry only
   after the server creates a hold. Do not show local selection as secured.

### Proposed authoritative allocation service

Resolve the screening and its inventory; validate IDs, contact/identity,
categories, protected seats, availability, and adjacency. Recheck every rule
inside the same transaction that creates the booking, tickets, and allocations.

For adjacency, examine left-to-right physical columns in each seated row after
the selection. Reject newly created internal single available seats bounded
by unavailable seats. A single seat at either row edge is allowed; runs of two
or more are allowed. Example from the backlog: with 5 and 6 booked, selecting
7 is allowed, selecting 8 alone isolates 7 and is rejected, and selecting 9
alone leaves 7 and 8 together and is allowed, absent other conflicts. Treatment
of temporary holds and pre-existing gaps is still O-07. Wheelchair adjacency
rules require agreement rather than automatic application of seated-row rules.

Validate the complete proposed selection, rather than rejecting each click as
an independent booking. For example, with seats 5 and 6 occupied, selecting 8
alone creates a gap, but selecting 7 and 8 together does not. Proposed UI
behaviour: allow users to build that selection, explain any current violation,
and prevent continuing until the complete selection is valid. Repeat validation
on the server; the preview can become stale before checkout.

An availability conflict should retain still-available selected IDs where
possible, identify the affected places, and require the customer to review the
updated selection. Never silently substitute seats or create a smaller booking.
Ignore responses for a screening the user has already left, so a slow request
cannot replace the current screening's layout or selection.

Proposed concurrency design: serialize all allocation/release/expiry operations
for a screening by locking its screening row, and use a dedicated active
allocation relation with unique `(screening_id, seat_id)`. Lock first, re-read
inventory, expire due allocations, validate, then write and commit. Every writer,
including payment transitions, staff and company flows, must follow the same
lock order. A unique key stops duplicate occupancy; serialization also protects
adjacency when competing requests select different seats in the same row.
Release active allocations atomically while retaining booking/ticket history.
An ordinary uniqueness constraint on `tickets.seat_id` would incorrectly stop
the same physical seat being used for different screenings.

### Proposed occupancy and transition rules

| Booking state | Occupancy interpretation | Transition integration |
| --- | --- | --- |
| `hold` | Blocks until its agreed checkout expiry. | Verified payment may make it paid; abandonment/expiry releases it. Late payment outcome is O-07. |
| `reserved` | Blocks while an unpaid account reservation is valid. | Requires an account, fewer than six places, and more than two hours before the show, subject to O-09. Expire at the two-hour deadline. |
| `paid` | Blocks; exempt from ordinary unpaid reservation expiry. | Enter only after verified payment or an agreed staff payment workflow. |
| `company_invoiced` | Blocks even if the invoice is unpaid. | Company acceptance and allocation must commit together; ordinary reservation expiry does not apply. |
| `expired` | Does not block. | Release allocation consistently for reads and writes while preserving history. |

No listed transition is currently implemented by the API. Use explicit instants
and cinema time in Europe/Helsinki, including daylight-saving boundaries; agree
a migration from timezone-less timestamps. Server pricing remains authoritative.
Stripe confirmation must be verified and idempotent. The existing booking-list
prototype is not a payment or hold-ownership mechanism.

Use the feature boundaries in [ARCHITECTURE.md](ARCHITECTURE.md): seating reads
and rules alongside screenings, booking orchestration in bookings, SQL in
repositories, and shared transaction coordination through deliberate service
interfaces. Introducing these modules must preserve the teammate's established
browsing endpoints and filters. A separate seating feature directory is a team
choice, not an existing implementation.

## 6. Responsibilities and unresolved decisions

The split below is proposed for coordination, not a confirmed assignment of
every task to the teammate.

| Area | Proposed responsibility | Coordination needed |
| --- | --- | --- |
| Andrew | Layout generation/rules and customer seat-map frontend. | Agree DTOs and shared service boundary before implementation. |
| Existing API contributor | Review compatibility with current endpoints and screening lookup. | Confirm who implements route corrections and booking writes. |
| Database owner, to be assigned | Migrations, inventory inspection/seeds, constraints, trigger corrections, active allocations. | Preserve IDs and existing booking history. |
| Booking/payment owner, to be assigned | Holds, reservation/expiry transitions, verified payments, staff/company allocation. | Use the same transaction and validation path as seating. |
| Team | Review contracts, race handling, integration checks, and update this document. | Record agreed decisions and implementation references as work lands. |
| Teacher/product decision owner | Clarify customer-facing unresolved rules. | Resolve relevant backlog decisions below. |

| Decision | Current position and impact |
| --- | --- |
| O-02: capacity and wheelchair inventory | Confirm CEO inclusion in 100/200; agree wheelchair identifiers, category/pricing and loyalty eligibility. Blocks final inventory configuration. |
| O-07: temporary holds and gaps | Agree hold duration, late payment handling, and treatment of holds/pre-existing isolated gaps. Blocks final allocation semantics. |
| O-09: reservation limits | Confirm counting wheelchair places toward six; staff deadlines, cinema settlement, and cutoff race policy. |
| O-03: staff permissions | Agree role/city permissions and authorized manual operations before exposing booking records or writes. |
| O-05/O-14: screening and booking changes | Agree rescheduling, cancellation/refund scope and inventory release; do not silently invalidate bookings. |
| O-06/O-08: checkout | Agree price/currency/rounding, contact fields, payment setup and confirmation access. |
| Team: wheelchair adjacency | Define whether any gap rule applies to wheelchair spaces. |
| Team: storage and ownership | Approve active-allocation schema, transaction locking, guest hold credential transport, and idempotency persistence. |
| Team: compatibility and refresh | Agree rollout of new DTO/error shapes, optional validation endpoint, refresh strategy and service/file ownership. |
| Team: deployed inventory | Verify applied schema and live data separately; the local source review establishes neither. |

### Proposed delivery and verification checklist

- Agree blocking inventory decisions and contracts before final configuration.
- Inspect existing inventory; add migrations/seeds for all four screens without
  replacing booked seat IDs. Verify 100/200 seated positions plus ten wheelchair
  spaces, skipped labels, snake direction and per-screen CEO protection.
- Correct availability membership/status handling and CEO trigger behaviour.
- Implement shared allocation, ownership, expiry, and database safeguards before
  exposing checkout writes. Preserve existing browsing route behaviour.
- Verify numbering across label 13 and physical row 13, protected seat attempts,
  internal versus edge gaps, cross-screen IDs, malformed input, and expired holds.
- Verify competing requests for the same seat and different seats in one row,
  rollback on partial failure, retries, payment/expiry races, and company exemption.
- Integrate both capacities in the frontend; verify orientation, wheelchair area,
  keyboard access, stale selection conflicts, and server-owned deadlines.

These are future implementation checks, not tests run during this documentation
task. After each implementation change, update the status sections with source
references and actual verification evidence. Keep remaining proposals explicit.

## 7. Seat-selection acceptance examples

These examples make the agreed backlog rules reviewable; they are not executed
tests. Unless stated otherwise, use seated row 1, with only seat 1 permanently
unavailable and all unspecified seats available. Evaluate each case independently.
Labels below identify places for readability; requests must send database IDs.

| Initial occupancy | Complete selection | Expected outcome |
| --- | --- | --- |
| CEO seat 1 only | 1 | Reject: permanently protected, for every actor. |
| CEO seat 1 only | 3 | Reject: available seat 2 would be isolated between 1 and 3. |
| CEO seat 1 only | 2 and 3 | Allow: no new internal single-seat gap. |
| Seats 5 and 6, plus CEO seat 1 | 7 | Allow: joins the occupied block. |
| Seats 5 and 6, plus CEO seat 1 | 8 | Reject: seat 7 would be isolated. |
| Seats 5 and 6, plus CEO seat 1 | 7 and 8 | Allow: evaluate the complete selection together. |
| Seats 5 and 6, plus CEO seat 1 | 9 | Allow: seats 7 and 8 remain together; seat 10 is an allowed edge gap. |
| CEO seat 1 only | 9 | Allow: available seat 10 is at the row edge. |
| Empty seated row 2 | Labels 14 and 11 | Reject: label 12 lies physically between them, despite skipped label 13. |
| Empty seated row 2 | Labels 14 and 12 | Allow: they are physically adjacent. |
| A selected place is already actively allocated | That place | Reject availability conflict; create no partial booking. |
| Seat belongs to another screen | That seat ID | Reject membership mismatch, even if its display label exists here. |
| Another screening occupies the same physical seat | That seat in this screening | Allow if otherwise valid: occupancy is screening-specific. |

Also verify both complete layouts: 10 or 20 physical rows, ten seated columns,
no label 13, reversed even rows, no missing physical row 13, the wheelchair
area in front of row 1, and the screen at the bottom. For a 200-seat layout,
physical row 13 has display row 14 and physical row 20 has display row 21.

For accessibility, review a full keyboard journey from screening to selection
and checkout. Each place needs a readable zone/row/seat/state label, selection
state must be exposed to assistive technology, and unavailable places must not
be selectable. Explain validation errors in text and announce selection changes
and conflicts. Keep focus predictable after refreshes and show the selected
screening and place summary throughout the journey. These are proposed UI
details supporting RIO-07, pending implementation and usability review.

Do not assign expected pass/fail results yet for pre-existing isolated gaps,
temporary holds as adjacency boundaries, wheelchair gap rules, or payment after
hold expiry. Resolve O-07 and the relevant team decisions, then add examples
here before implementing those behaviours.
