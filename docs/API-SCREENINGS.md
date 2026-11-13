# Screening read API

Implemented by #53. Existing city and film filters are retained; screen filtering
and the `film_id` response field are additive. No schema migration is required.

## Request

```http
GET /api/screenings?cityId=1&screenId=1&filmId=1
```

All three filters are optional and combine with **AND**:

| Parameter  | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| `cityId`   | City database ID, compared with the screening screen's city. |
| `screenId` | Screen database ID.                                          |
| `filmId`   | Film database ID.                                            |

Each provided value must be one decimal integer from 1 through 2147483647,
matching the existing PostgreSQL integer IDs. Leading zeros are accepted and
normalized. Empty values, signs, whitespace, decimals, exponent notation,
out-of-range values, repeated keys and bracket/array notation are rejected.
Validation finishes before querying the repository. Other unrecognized query
keys remain ignored for compatibility; they are not additional filters.

Unfiltered calls still return all screenings, including past screenings.
This change does not introduce a future-only rule, date filter or pagination.
Customer browsing must choose eligible future showtimes separately.
Results are ordered by `screening_time`, then `id` for deterministic ties.

## Response and identities

Captured from the isolated M0 development database on 13 November 2026:

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "screening_time": "2026-11-14T16:00:00.000Z",
      "film_id": 1,
      "film_title": "RIO demo: Northern Lights",
      "screen_id": 1,
      "city_id": 1,
      "city_name": "Oulu"
    }
  ]
}
```

`id` identifies the screening; `film_id`, `screen_id` and `city_id` identify its
linked records. These are database identities, not list positions or display
labels. Use `film_id` to join with `/api/films` or `/api/films/:id`; titles are
for display and are not unique identifiers. All previous fields remain present.
Example IDs above belong to the current fixtures, not a universal ID contract.

| Condition                                                           | HTTP status and body                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Matching screenings                                                 | `200`, `{ "success": true, "data": [...] }`                                                            |
| No matches, unknown valid IDs, or contradictory city/screen filters | `200`, `{ "success": true, "data": [] }`                                                               |
| Malformed filter, e.g. `screenId=1.5`                               | `400`, `{ "success": false, "error": "screenId must be a positive integer between 1 and 2147483647" }` |
| Unexpected database failure                                         | Existing `500` error envelope; database details are omitted.                                           |

An empty result does not distinguish a nonexistent ID from an incompatible
combination. A valid city's screen and another city's `cityId` cannot match.

## Timestamp interpretation

The existing schema stores `screening_time` as `timestamp without time zone`.
M0 fixture values represent Europe/Helsinki wall time. Continue running the
current development backend with `TZ=Europe/Helsinki`; the existing PostgreSQL
parser then produces the ISO UTC string returned by Express. For example,
14 November 2026 at 18:00 Helsinki is `2026-11-14T16:00:00.000Z`.

The future customer interface should format these instants explicitly in
`Europe/Helsinki`, rather than using the browser's default timezone. Winter and
summer offsets are covered by tests. No timestamp field was renamed, reformatted
or migrated here. A different process timezone or differently interpreted legacy
data can still produce incorrect instants; production adoption and a timezone-
aware storage migration need a separately agreed change. This endpoint does not
resolve ambiguous/nonexistent local times at daylight-saving transitions.

## Implementation and verification

`backend/src/features/screenings/` follows route → controller → service →
repository. The service validates filters; the repository builds parameterized
SQL from a fixed column list; the controller retains the JSON envelopes.
`backend/api.js` composes this feature and retains the other prototype routes.
The feature uses the existing application database pool.

From `backend/`, with the isolated local development database running:

```bash
npm run test:postgres
npm start
```

With the backend running, in another terminal in `backend/`:

```bash
npm run verify:browsing
```

The full backend suite passed 35 tests with no skips. New coverage includes all
eight optional-filter combinations, invalid/repeated/array IDs before SQL,
contradictory filters, unknown and unscheduled records, preserved fields,
`film_id` joins, stable ordering, winter/summer serialization and retained past
screenings. Tests write only to dedicated temporary local test databases.
The verifier checks all four screens and eight future M0 fixture screenings
through a real running Express process and read-only database queries.

[Recorded evidence](../database/verification/screening-filters.json) includes
matching, contradictory and invalid requests against the retained local data.
Frontend selection controls and browsing request coordination remain #54/#25.
No seat availability, booking writes or deployment behavior changed.
