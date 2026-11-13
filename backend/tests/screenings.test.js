import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../src/server.js";
import { migrateDatabase } from "../scripts/database/migrate.js";
import { seedBrowsing } from "../scripts/database/seed-browsing.js";
import {
  assertIsolatedDevelopment,
  assertConnectedLocalTarget,
  createClient,
} from "../scripts/database/connection.js";

const config = {
  databaseUrl: "postgresql://localhost/rio_test",
  frontendUrl: "http://localhost:5173",
  port: 0,
};
const mode = "isolated-development";
const databaseUrl = process.env.TEST_SCREENINGS_DATABASE_URL;

function fakePool({ failQueries = false } = {}) {
  return {
    calls: [],
    async query(sql, parameters) {
      this.calls.push({ sql, parameters });
      if (failQueries && sql !== "SELECT 1")
        throw new Error("Private database detail");
      return { rows: [] };
    },
    async end() {},
  };
}

for (const name of ["cityId", "screenId", "filmId"]) {
  test(`${name} rejects malformed and repeated IDs before querying PostgreSQL`, async (t) => {
    const pool = fakePool();
    const { server, shutdown } = await startServer({
      config,
      pool,
      host: "127.0.0.1",
    });
    t.after(shutdown);
    const base = `http://127.0.0.1:${server.address().port}/api/screenings`;
    const malformed = [
      "",
      "0",
      "-1",
      "1.5",
      "1e2",
      "+1",
      " 1",
      "1 ",
      "abc",
      "null",
      "2147483648",
      "9007199254740993",
      "1 OR 1=1",
    ];
    const before = pool.calls.length;
    for (const value of malformed) {
      const response = await fetch(
        `${base}?${name}=${encodeURIComponent(value)}`,
      );
      assert.equal(response.status, 400, `${name}=${value}`);
      assert.deepEqual(await response.json(), {
        success: false,
        error: `${name} must be a positive integer between 1 and 2147483647`,
      });
    }
    for (const query of [
      `${name}=1&${name}=2`,
      `${name}[]=1`,
      `${name}[nested]=1`,
      `${name}=1&${name}[nested]=2`,
    ]) {
      const response = await fetch(`${base}?${query}`);
      assert.equal(response.status, 400, query);
    }
    assert.equal(
      pool.calls.length,
      before,
      "Malformed filters must not reach the database",
    );
  });
}

test("valid ID boundaries and leading zeros are accepted", async (t) => {
  const pool = fakePool();
  const { server, shutdown } = await startServer({
    config,
    pool,
    host: "127.0.0.1",
  });
  t.after(shutdown);
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/screenings?filmId=2147483647&cityId=0007&screenId=1`,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: [] });
  assert.deepEqual(pool.calls.at(-1).parameters, [2147483647, 7, 1]);
});

test("unexpected database failures retain the existing safe 500 envelope", async (t) => {
  const { server, shutdown } = await startServer({
    config,
    pool: fakePool({ failQueries: true }),
    host: "127.0.0.1",
  });
  t.after(shutdown);
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/screenings?screenId=1`,
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    success: false,
    error: "There was an inside error while fetching screenings",
  });
});

test(
  "real PostgreSQL screening filters",
  { skip: !databaseUrl, timeout: 30000 },
  async (t) => {
    const database = assertIsolatedDevelopment(databaseUrl, mode);
    const admin = createClient(databaseUrl);
    await admin.connect();
    t.after(() => admin.end());
    await assertConnectedLocalTarget(admin, database);
    const name = `rio_test_screenings_${process.pid}`;
    const url = new URL(databaseUrl);
    url.pathname = `/${name}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const client = createClient(url.href);
    let running;
    try {
      await client.connect();
      await migrateDatabase({ databaseUrl: url.href, mode });
      const fixtures = await seedBrowsing({ databaseUrl: url.href, mode });
      running = await startServer({
        config: { ...config, databaseUrl: url.href },
        host: "127.0.0.1",
      });
      const base = `http://127.0.0.1:${running.server.address().port}`;
      async function get(query = "") {
        const response = await fetch(`${base}/api/screenings${query}`);
        assert.equal(response.status, 200, query);
        const body = await response.json();
        assert.equal(body.success, true);
        return body.data;
      }
      const oulu = fixtures.cities[0];
      const tampere = fixtures.cities[1];
      const screen = oulu.screens[0];
      const filmId = screen.screenings[0].film_id;
      const all = await get();
      assert.equal(all.length, 8);

      await t.test(
        "all eight combinations of optional filters match only the selected identities",
        async () => {
          const options = [
            ["cityId", oulu.id, "city_id"],
            ["screenId", screen.id, "screen_id"],
            ["filmId", filmId, "film_id"],
          ];
          for (let mask = 0; mask < 8; mask += 1) {
            const selected = options.filter((_, index) => mask & (1 << index));
            const query = new URLSearchParams(
              selected.map(([key, value]) => [key, String(value)]),
            );
            const actual = await get(query.size ? `?${query}` : "");
            const expected = all.filter((row) =>
              selected.every(([, value, column]) => row[column] === value),
            );
            assert.deepEqual(actual, expected, query.toString());
          }
        },
      );

      await t.test(
        "contradictory city/screen filters and valid missing IDs return empty arrays",
        async () => {
          assert.deepEqual(
            await get(`?cityId=${tampere.id}&screenId=${screen.id}`),
            [],
          );
          assert.deepEqual(
            await get(
              `?cityId=${tampere.id}&screenId=${screen.id}&filmId=${filmId}`,
            ),
            [],
          );
          for (const key of ["cityId", "screenId", "filmId"])
            assert.deepEqual(await get(`?${key}=2147483647`), []);
          const unscheduled = (
            await client.query(
              "INSERT INTO films (title) VALUES ('Unscheduled film') RETURNING id",
            )
          ).rows[0];
          assert.deepEqual(await get(`?filmId=${unscheduled.id}`), []);
        },
      );

      await t.test(
        "existing fields, stable film IDs and chronological ordering remain consistent",
        async () => {
          for (const row of all) {
            for (const key of [
              "id",
              "screening_time",
              "film_title",
              "screen_id",
              "city_id",
              "city_name",
            ])
              assert.ok(Object.hasOwn(row, key), key);
            const filmResponse = await fetch(
              `${base}/api/films/${row.film_id}`,
            );
            assert.equal(filmResponse.status, 200);
            assert.equal(
              (await filmResponse.json()).data.title,
              row.film_title,
            );
            const screening = (
              await client.query(
                "SELECT film_id, screen_id FROM screenings WHERE id = $1",
                [row.id],
              )
            ).rows[0];
            assert.equal(row.film_id, screening.film_id);
            assert.equal(row.screen_id, screening.screen_id);
          }
          const sorted = [...all].sort(
            (a, b) =>
              Date.parse(a.screening_time) - Date.parse(b.screening_time) ||
              a.id - b.id,
          );
          assert.deepEqual(
            all.map((row) => row.id),
            sorted.map((row) => row.id),
          );
        },
      );

      await t.test(
        "the existing Helsinki convention handles winter/summer and retains past screenings",
        async () => {
          for (const [local, iso] of [
            ["2030-01-15 18:00:00", "2030-01-15T16:00:00.000Z"],
            ["2030-07-15 18:00:00", "2030-07-15T15:00:00.000Z"],
            ["2020-01-15 18:00:00", "2020-01-15T16:00:00.000Z"],
          ]) {
            const inserted = (
              await client.query(
                "INSERT INTO screenings (film_id, screen_id, screening_time) VALUES ($1, $2, $3) RETURNING id",
                [filmId, screen.id, local],
              )
            ).rows[0];
            const row = (
              await get(`?screenId=${screen.id}&filmId=${filmId}`)
            ).find((row) => row.id === inserted.id);
            assert.ok(row);
            assert.equal(row.screening_time, iso);
          }
        },
      );
    } finally {
      if (running) await running.shutdown();
      await client.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    }
  },
);
