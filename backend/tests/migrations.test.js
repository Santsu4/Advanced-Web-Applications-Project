import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertIsolatedDevelopment,
  createClient,
  readDatabaseUrl,
} from "../scripts/database/connection.js";
import {
  APPLICATION_TABLES,
  inspectDatabase,
} from "../scripts/database/inspect.js";
import { migrateDatabase } from "../scripts/database/migrate.js";

const mode = "isolated-development";
const databaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const baseline = new URL(
  "../../database/migrations/0001_initial_schema.sql",
  import.meta.url,
);

function migrate(url, extra = {}) {
  return migrateDatabase({ databaseUrl: url, mode, ...extra });
}

test("migration target guard rejects shared targets and connection overrides before connecting", () => {
  const url = "postgresql://tester:private-secret@127.0.0.1:5432/rio_dev";
  assert.equal(assertIsolatedDevelopment(url, mode), "rio_dev");
  assert.equal(
    assertIsolatedDevelopment("postgresql://localhost/rio_test_example", mode),
    "rio_test_example",
  );
  assert.throws(
    () => assertIsolatedDevelopment(url, undefined),
    /RIO_DATABASE_MODE/,
  );
  for (const target of [
    "postgresql://db.example/rio_dev",
    "postgresql://127.0.0.1/production",
    "postgresql://127.0.0.1/rio_development",
    "postgresql://127.0.0.1/rio_dev?host=db.example",
    "postgresql://127.0.0.1/rio_dev?dbname=production",
    "postgresql://127.0.0.1/rio_dev#fragment",
  ]) {
    assert.throws(
      () => assertIsolatedDevelopment(target, mode),
      /Migration requires/,
    );
  }
  assert.throws(
    () => readDatabaseUrl({ DATABASE_URL: "private-secret" }),
    (error) =>
      error.message.includes("DATABASE_URL") &&
      !error.message.includes("private-secret"),
  );
});

test(
  "isolated PostgreSQL schema workflow",
  { skip: !databaseUrl, timeout: 45000 },
  async (t) => {
    assertIsolatedDevelopment(databaseUrl, mode);
    const admin = createClient(databaseUrl);
    await admin.connect();
    t.after(() => admin.end());
    const target = (
      await admin.query("SELECT host(inet_server_addr()) AS address")
    ).rows[0];
    assert.ok(["127.0.0.1", "::1"].includes(target.address));
    let serial = 0;

    async function withDatabase(run) {
      const name = `rio_test_schema_${process.pid}_${++serial}`;
      const url = new URL(databaseUrl);
      url.pathname = `/${name}`;
      await admin.query(`CREATE DATABASE ${name}`);
      const client = createClient(url.href);
      try {
        await client.connect();
        await run(url.href, client);
      } finally {
        await client.end();
        await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      }
    }

    async function withMigrations(files, run) {
      const directory = await mkdtemp(join(tmpdir(), "rio-migration-files-"));
      try {
        for (const [name, sql] of Object.entries(files))
          await writeFile(join(directory, name), sql);
        await run(pathToFileURL(directory + "/"));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    await t.test(
      "inspect empty schema, apply baseline, verify catalog and preserve linked records on rerun",
      async () => {
        await withDatabase(async (url, client) => {
          const before = await inspectDatabase(url);
          assert.equal(before.transaction_read_only, "on");
          assert.deepEqual(before.tables, []);
          assert.deepEqual(before.missingTables, APPLICATION_TABLES);
          assert.deepEqual(await migrate(url), {
            applied: ["0001_initial_schema.sql"],
            previouslyApplied: 0,
          });
          const schema = await inspectDatabase(url);
          assert.deepEqual(schema.missingTables, []);
          assert.equal(schema.tables.length, 12);
          assert.equal(
            schema.constraints.filter((row) => row.type === "f").length,
            13,
          );
          assert.equal(
            schema.constraints.filter((row) => row.type === "c").length,
            9,
          );
          assert.equal(
            schema.constraints.filter((row) => row.type === "p").length,
            12,
          );
          assert.deepEqual(
            schema.triggers.map((row) => [row.name, row.enabled]),
            [
              ["trg_prevent_ceo_seat_booking", "O"],
              ["trg_protect_ceo_seat_config", "O"],
            ],
          );
          assert.deepEqual(
            schema.functions.map((row) => row.name),
            ["prevent_ceo_seat_booking", "protect_ceo_seat_config"],
          );
          assert.ok(
            schema.indexes.some((row) => row.name === "cities_name_key"),
          );
          assert.ok(
            schema.indexes.some((row) => row.name === "users_email_key"),
          );
          const expectedColumns = {
            cities: "id name",
            screens: "id city_id capacity wheelchair_capacity",
            seats:
              "id screen_id physical_row row_label seat_label is_wheelchair is_ceo_reserved",
            films: "id title metadata_api_id description artwork_url",
            screenings: "id film_id screen_id screening_time",
            prices: "id category amount_cents",
            users:
              "id role permitted_city_id email password_hash loyalty_progress",
            bookings:
              "id user_id guest_email screening_id status booking_time expiry_time",
            tickets:
              "id booking_id seat_id price_id is_loyalty_rewarded amount_charged",
            company_requests:
              "id company_name contact_email film_id screening_id attendee_count status message",
            invoices: "id booking_id company_name is_paid",
          };
          for (const [name, columns] of Object.entries(expectedColumns)) {
            assert.equal(
              schema.columns
                .filter((row) => row.table_name === name)
                .map((row) => row.column_name)
                .join(" "),
              columns,
            );
          }
          assert.equal(
            schema.columns.find(
              (row) =>
                row.table_name === "screenings" &&
                row.column_name === "screening_time",
            ).data_type,
            "timestamp without time zone",
          );

          await client.query("INSERT INTO cities (name) VALUES ('Oulu')");
          await client.query(
            "INSERT INTO screens (city_id, capacity) VALUES (1, 100)",
          );
          assert.equal(
            (await client.query("SELECT wheelchair_capacity FROM screens"))
              .rows[0].wheelchair_capacity,
            10,
          );
          await assert.rejects(
            client.query(
              "INSERT INTO screens (city_id, capacity) VALUES (1, 50)",
            ),
            { code: "23514" },
          );
          await assert.rejects(
            client.query(
              "INSERT INTO screens (city_id, capacity) VALUES (999, 100)",
            ),
            { code: "23503" },
          );
          await assert.rejects(
            client.query(
              "INSERT INTO seats (screen_id, physical_row, row_label, seat_label) VALUES (1, 1, 13, 2)",
            ),
            { code: "23514" },
          );
          await assert.rejects(
            client.query(
              "INSERT INTO seats (screen_id, physical_row, row_label, seat_label) VALUES (1, 1, 1, 13)",
            ),
            { code: "23514" },
          );
          await client.query(
            "INSERT INTO seats (screen_id, physical_row, row_label, seat_label, is_ceo_reserved) VALUES (1, 1, 1, 1, true), (1, 1, 1, 2, false)",
          );
          const seats = (
            await client.query("SELECT id FROM seats ORDER BY seat_label")
          ).rows;
          await client.query(
            "INSERT INTO films (title) VALUES ('Schema verification film')",
          );
          await client.query(
            "INSERT INTO screenings (film_id, screen_id, screening_time) VALUES (1, 1, '2030-01-01 18:00:00')",
          );
          await client.query(
            "INSERT INTO prices (category, amount_cents) VALUES ('adult', 1200)",
          );
          await assert.rejects(
            client.query(
              "INSERT INTO bookings (screening_id, status) VALUES (1, 'paid')",
            ),
            { code: "23514" },
          );
          await assert.rejects(
            client.query(
              "INSERT INTO bookings (screening_id, status, guest_email) VALUES (1, 'unknown', 'example@example.test')",
            ),
            { code: "23514" },
          );
          const booking = (
            await client.query(
              "INSERT INTO bookings (screening_id, status, guest_email) VALUES (1, 'paid', 'example@example.test') RETURNING id",
            )
          ).rows[0];
          await assert.rejects(
            client.query(
              "INSERT INTO tickets (booking_id, seat_id, price_id, amount_charged) VALUES ($1, $2, 1, 1200)",
              [booking.id, seats[0].id],
            ),
            { code: "P0001" },
          );
          await assert.rejects(
            client.query(
              "UPDATE seats SET is_ceo_reserved = false WHERE seat_label = 1",
            ),
            { code: "P0001" },
          );
          await assert.rejects(
            client.query("DELETE FROM seats WHERE seat_label = 1"),
            { code: "P0001" },
          );
          await client.query(
            "INSERT INTO tickets (booking_id, seat_id, price_id, amount_charged) VALUES ($1, $2, 1, 1200)",
            [booking.id, seats[1].id],
          );
          async function snapshot() {
            const rows = {};
            for (const name of APPLICATION_TABLES)
              rows[name] = (
                await client.query(
                  `SELECT jsonb_agg(to_jsonb(t) ORDER BY id) AS records FROM public.${name} t`,
                )
              ).rows[0].records;
            return rows;
          }
          const records = await snapshot();
          assert.deepEqual(await migrate(url), {
            applied: [],
            previouslyApplied: 1,
          });
          assert.deepEqual(await snapshot(), records);
          assert.equal(
            (
              await client.query(
                "INSERT INTO cities (name) VALUES ('Tampere') RETURNING id",
              )
            ).rows[0].id,
            2,
          );
          const original = await readFile(baseline, "utf8");
          await withMigrations(
            { "0001_initial_schema.sql": original + "\n-- changed history\n" },
            async (directory) => {
              await assert.rejects(
                migrate(url, { directory }),
                /history differs/,
              );
            },
          );
          assert.equal(
            (
              await client.query(
                "SELECT count(*)::int AS count FROM rio_schema_migrations",
              )
            ).rows[0].count,
            1,
          );
          console.log(
            "Schema evidence: empty → 11 application tables, 13 foreign keys, 9 checks, 2 enabled triggers; linked IDs survive rerun.",
          );
        });
      },
    );

    await t.test(
      "two migration connections serialize without duplicate application",
      async () => {
        await withDatabase(async (url) => {
          const results = await Promise.all([migrate(url), migrate(url)]);
          assert.equal(
            results.reduce((count, result) => count + result.applied.length, 0),
            1,
          );
          assert.equal((await inspectDatabase(url)).tables.length, 12);
        });
      },
    );

    await t.test(
      "failed migration rolls back baseline and ledger together",
      async () => {
        await withDatabase(async (url) => {
          await withMigrations(
            {
              "0001_initial_schema.sql": await readFile(baseline, "utf8"),
              "0002_failure.sql":
                "CREATE TABLE partial_change (id int); SELECT * FROM missing_relation;",
            },
            async (directory) => {
              await assert.rejects(migrate(url, { directory }), {
                code: "42P01",
              });
            },
          );
          assert.deepEqual((await inspectDatabase(url)).tables, []);
        });
      },
    );

    await t.test(
      "an existing untracked legacy schema is refused and preserved",
      async () => {
        await withDatabase(async (url, client) => {
          await client.query(await readFile(baseline, "utf8"));
          await client.query(
            "INSERT INTO cities (name) VALUES ('Preserve me')",
          );
          const before = await inspectDatabase(url);
          await assert.rejects(
            migrate(url),
            /Automatic baseline adoption is disabled/,
          );
          assert.deepEqual(await inspectDatabase(url), before);
          assert.equal(
            (await client.query("SELECT name FROM cities")).rows[0].name,
            "Preserve me",
          );
        });
      },
    );
  },
);
