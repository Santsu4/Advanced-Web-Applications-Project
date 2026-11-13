import test from "node:test";
import assert from "node:assert/strict";
import { seedBrowsing } from "../scripts/database/seed-browsing.js";
import { verifyBrowsing } from "../scripts/database/verify-browsing.js";
import {
  assertIsolatedDevelopment,
  assertConnectedLocalTarget,
  createClient,
} from "../scripts/database/connection.js";
import { migrateDatabase } from "../scripts/database/migrate.js";
import { startServer } from "../src/server.js";

const mode = "isolated-development";
const databaseUrl = process.env.TEST_BROWSING_DATABASE_URL;

test("browsing seeding refuses an unspecified or nonlocal write target", async () => {
  await assert.rejects(
    seedBrowsing({ databaseUrl: "postgresql://localhost/rio_dev" }),
    /RIO_DATABASE_MODE/,
  );
  await assert.rejects(
    seedBrowsing({ databaseUrl: "postgresql://shared.example/rio_dev", mode }),
    /Migration requires/,
  );
});

test(
  "real development fixtures and browsing APIs",
  { skip: !databaseUrl, timeout: 45000 },
  async (t) => {
    const database = assertIsolatedDevelopment(databaseUrl, mode);
    const admin = createClient(databaseUrl);
    await admin.connect();
    t.after(() => admin.end());
    await assertConnectedLocalTarget(admin, database);
    let serial = 0;
    async function withDatabase(run, applySchema = true) {
      const name = `rio_test_browsing_${process.pid}_${++serial}`;
      const url = new URL(databaseUrl);
      url.pathname = `/${name}`;
      await admin.query(`CREATE DATABASE ${name}`);
      const client = createClient(url.href);
      try {
        await client.connect();
        if (applySchema) await migrateDatabase({ databaseUrl: url.href, mode });
        await run(url.href, client);
      } finally {
        await client.end();
        await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      }
    }
    const seed = (url) => seedBrowsing({ databaseUrl: url, mode });
    async function snapshot(client) {
      const result = {};
      for (const name of [
        "cities",
        "screens",
        "films",
        "screenings",
        "bookings",
      ]) {
        result[name] = (
          await client.query(
            `SELECT jsonb_agg(to_jsonb(t) ORDER BY id) AS records FROM public.${name} t`,
          )
        ).rows[0].records;
      }
      return result;
    }

    await t.test(
      "arbitrary IDs, idempotent fixtures, preserved bookings and real API filters",
      async () => {
        await withDatabase(async (url, client) => {
          await client.query(
            "INSERT INTO cities (name) VALUES ('Unrelated city')",
          );
          await client.query(
            "INSERT INTO films (title) VALUES ('Unrelated film')",
          );
          const first = await seed(url);
          assert.deepEqual(
            first.cities.map((city) => city.name),
            ["Oulu", "Tampere"],
          );
          assert.notEqual(first.cities[0].id, 1);
          assert.equal(first.cities.flatMap((city) => city.screens).length, 4);
          for (const city of first.cities) {
            assert.deepEqual(
              city.screens.map((screen) => screen.capacity),
              [100, 200],
            );
            assert.ok(
              city.screens.every(
                (screen) =>
                  screen.wheelchair_capacity === 10 &&
                  screen.screenings.length === 2,
              ),
            );
          }
          const selected = first.cities[0].screens[0].screenings[0];
          const booking = (
            await client.query(
              "INSERT INTO bookings (screening_id, status, guest_email) VALUES ($1, 'paid', 'fixture@example.test') RETURNING id",
              [selected.id],
            )
          ).rows[0];
          const before = await snapshot(client);
          assert.deepEqual(await seed(url), first);
          assert.deepEqual(await snapshot(client), before);
          assert.equal(
            (await client.query("SELECT count(*)::int AS count FROM seats"))
              .rows[0].count,
            0,
          );
          const { server, shutdown } = await startServer({
            config: {
              databaseUrl: url,
              frontendUrl: "http://localhost:5173",
              port: 0,
            },
            host: "127.0.0.1",
          });
          try {
            const baseUrl = `http://127.0.0.1:${server.address().port}`;
            const report = await verifyBrowsing({ databaseUrl: url, baseUrl });
            assert.equal(report.transactionReadOnly, "on");
            assert.equal(report.verifiedScreens, 4);
            assert.equal(report.verifiedScreenings, 8);
            // Expiry must append a replacement, never reschedule a referenced show.
            await client.query(
              "UPDATE screenings SET screening_time = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Helsinki') - interval '1 day' WHERE id = $1",
              [selected.id],
            );
            const old = (
              await client.query(
                "SELECT to_char(screening_time, 'YYYY-MM-DD HH24:MI:SS') AS time FROM screenings WHERE id = $1",
                [selected.id],
              )
            ).rows[0];
            const renewed = await seed(url);
            assert.notEqual(
              renewed.cities[0].screens[0].screenings[0].id,
              selected.id,
            );
            assert.deepEqual(
              (
                await client.query(
                  "SELECT to_char(screening_time, 'YYYY-MM-DD HH24:MI:SS') AS time FROM screenings WHERE id = $1",
                  [selected.id],
                )
              ).rows[0],
              old,
            );
            assert.equal(
              (
                await client.query(
                  "SELECT screening_id FROM bookings WHERE id = $1",
                  [booking.id],
                )
              ).rows[0].screening_id,
              selected.id,
            );
            assert.equal(
              (await verifyBrowsing({ databaseUrl: url, baseUrl }))
                .verifiedScreenings,
              8,
            );
          } finally {
            await shutdown();
          }
        });
      },
    );

    await t.test(
      "concurrent seeds do not duplicate films, screens or screenings",
      async () => {
        await withDatabase(async (url, client) => {
          const [first, second] = await Promise.all([seed(url), seed(url)]);
          assert.deepEqual(first, second);
          for (const [table, expected] of [
            ["cities", 2],
            ["screens", 4],
            ["films", 2],
            ["screenings", 8],
          ]) {
            assert.equal(
              (
                await client.query(
                  `SELECT count(*)::int AS count FROM ${table}`,
                )
              ).rows[0].count,
              expected,
            );
          }
        });
      },
    );

    await t.test(
      "ambiguous existing screens cause a complete rollback",
      async () => {
        await withDatabase(async (url, client) => {
          await client.query("INSERT INTO cities (name) VALUES ('Tampere')");
          await client.query(
            "INSERT INTO screens (city_id, capacity) VALUES (1, 100), (1, 100)",
          );
          const before = await snapshot(client);
          await assert.rejects(seed(url), /Ambiguous/);
          assert.deepEqual(await snapshot(client), before);
        });
      },
    );

    await t.test(
      "existing incompatible wheelchair capacity is preserved",
      async () => {
        await withDatabase(async (url, client) => {
          await client.query("INSERT INTO cities (name) VALUES ('Oulu')");
          await client.query(
            "INSERT INTO screens (city_id, capacity, wheelchair_capacity) VALUES (1, 100, 9)",
          );
          const before = await snapshot(client);
          await assert.rejects(seed(url), /wheelchair capacity differs/);
          assert.deepEqual(await snapshot(client), before);
        });
      },
    );

    await t.test(
      "missing migration baseline is refused without creating schema",
      async () => {
        await withDatabase(async (url, client) => {
          await assert.rejects(seed(url), /Apply db:migrate:dev/);
          assert.equal(
            (
              await client.query(
                "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public'",
              )
            ).rows[0].count,
            0,
          );
        }, false);
      },
    );
  },
);
