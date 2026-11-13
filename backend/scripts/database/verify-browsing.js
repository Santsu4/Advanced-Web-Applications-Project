import assert from "node:assert/strict";
import {
  CITY_NAMES,
  SCREEN_CAPACITIES,
  DEMO_FILMS,
} from "../../../database/seeds/browsing.js";
import { createClient, DatabaseCommandError } from "./connection.js";

function helsinkiTime(value) {
  const date = new Date(value);
  assert.ok(
    Number.isFinite(date.getTime()),
    "API screening timestamp must be parseable",
  );
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Helsinki",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export async function verifyBrowsing({ databaseUrl, baseUrl }) {
  const url = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new DatabaseCommandError("API_BASE_URL must be an HTTP(S) origin");
  }
  const client = createClient(databaseUrl);
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL TIME ZONE 'Europe/Helsinki'");
    const expected = (
      await client.query(
        `
      SELECT DISTINCT ON (c.id, s.id, f.id)
             c.id AS city_id, c.name AS city_name, s.id AS screen_id, s.capacity,
             s.wheelchair_capacity, f.id AS film_id, f.title AS film_title,
             f.metadata_api_id AS film_marker, sc.id AS screening_id,
             to_char(sc.screening_time, 'YYYY-MM-DD"T"HH24:MI:SS') AS local_time
      FROM public.cities c JOIN public.screens s ON s.city_id = c.id
      JOIN public.screenings sc ON sc.screen_id = s.id JOIN public.films f ON f.id = sc.film_id
      WHERE c.name = ANY($1::text[]) AND f.metadata_api_id = ANY($2::text[])
        AND sc.screening_time > localtimestamp
      ORDER BY c.id, s.id, f.id, sc.screening_time, sc.id
    `,
        [CITY_NAMES, DEMO_FILMS.map((film) => film.key)],
      )
    ).rows;
    const readOnly = (await client.query("SHOW transaction_read_only")).rows[0]
      .transaction_read_only;
    await client.query("COMMIT");
    assert.equal(
      expected.length,
      8,
      "Expected two future demo films for each of four screens; run db:seed:browsing",
    );
    async function get(path) {
      const response = await fetch(url.origin + path, {
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 200, `GET ${path}`);
      const body = await response.json();
      assert.equal(body.success, true, path);
      return body.data;
    }
    const cities = await get("/api/cities");
    const films = await get("/api/films");
    const allScreens = await get("/api/screens");
    const allScreenings = await get("/api/screenings");
    for (const name of CITY_NAMES) {
      const city = cities.find((row) => row.name === name);
      assert.ok(city, `${name} must be returned by the cities API`);
      assert.deepEqual(await get(`/api/cities/${city.id}`), city);
      const screens = await get(`/api/screens?cityId=${city.id}`);
      assert.ok(
        screens.every((row) => row.city_id === city.id),
        "Screen city filter must not leak another city",
      );
      const screenings = await get(`/api/screenings?cityId=${city.id}`);
      assert.ok(
        screenings.every((row) => row.city_id === city.id),
        "Screening city filter must not leak another city",
      );
      for (const capacity of SCREEN_CAPACITIES) {
        const matchingScreens = screens.filter(
          (row) => row.capacity === capacity,
        );
        assert.equal(
          matchingScreens.length,
          1,
          `${name} must have one ${capacity}-seat screen`,
        );
        const screen = matchingScreens[0];
        assert.equal(screen.wheelchair_capacity, 10);
        assert.deepEqual(await get(`/api/screens/${screen.id}`), screen);
        assert.ok(allScreens.some((row) => row.id === screen.id));
        for (const demo of DEMO_FILMS) {
          const reference = expected.find(
            (row) =>
              row.city_id === city.id &&
              row.screen_id === screen.id &&
              row.film_marker === demo.key,
          );
          assert.ok(
            reference,
            "Fixture identity must match the database, not assumed IDs",
          );
          const film = films.find((row) => row.id === reference.film_id);
          assert.ok(film);
          assert.equal(film.title, reference.film_title);
          assert.deepEqual(await get(`/api/films/${film.id}`), film);
          const filtered = await get(
            `/api/screenings?cityId=${city.id}&filmId=${film.id}`,
          );
          const filmOnly = await get(`/api/screenings?filmId=${film.id}`);
          const screenOnly = await get(`/api/screenings?screenId=${screen.id}`);
          const completeFilter = await get(
            `/api/screenings?cityId=${city.id}&screenId=${screen.id}&filmId=${film.id}`,
          );
          assert.ok(
            screenOnly.every((row) => row.screen_id === screen.id),
            "Screen filter must not return another screen",
          );
          assert.ok(
            completeFilter.every(
              (row) =>
                row.city_id === city.id &&
                row.screen_id === screen.id &&
                row.film_id === film.id,
            ),
            "Complete filters must preserve all selected identities",
          );
          assert.ok(
            filtered.every(
              (row) => row.city_id === city.id && row.film_id === film.id,
            ),
            "Combined filters must retain the selected city and film",
          );
          assert.ok(
            filmOnly.every((row) => row.film_id === film.id),
            "Film filter must retain the selected film",
          );
          for (const rows of [
            allScreenings,
            screenings,
            filtered,
            filmOnly,
            screenOnly,
            completeFilter,
          ]) {
            const screening = rows.find(
              (row) => row.id === reference.screening_id,
            );
            assert.ok(
              screening,
              "Expected screening must survive supported filters",
            );
            assert.equal(screening.screen_id, screen.id);
            assert.equal(screening.city_id, city.id);
            assert.equal(screening.city_name, city.name);
            assert.equal(screening.film_title, film.title);
            assert.equal(screening.film_id, film.id);
            assert.equal(
              helsinkiTime(screening.screening_time),
              reference.local_time,
              "Run the current timestamp-without-time-zone backend with TZ=Europe/Helsinki",
            );
            assert.ok(
              Date.parse(screening.screening_time) > Date.now(),
              "Fixture screening must be future",
            );
          }
        }
      }
    }
    const first = expected[0];
    const otherCity = expected.find((row) => row.city_id !== first.city_id);
    assert.deepEqual(
      await get(
        `/api/screenings?cityId=${otherCity.city_id}&screenId=${first.screen_id}`,
      ),
      [],
      "Contradictory filters must return no screenings",
    );
    const malformed = await fetch(
      url.origin + "/api/screenings?screenId=invalid",
      { signal: AbortSignal.timeout(5000) },
    );
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).success, false);
    return {
      transactionReadOnly: readOnly,
      timezone: "Europe/Helsinki",
      verifiedScreens: 4,
      verifiedScreenings: expected.length,
      examples: expected,
    };
  } finally {
    await client.end();
  }
}
