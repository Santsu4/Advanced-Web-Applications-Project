import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import {
  assertIsolatedDevelopment,
  createClient,
  DatabaseCommandError,
} from "./connection.js";

const DEFAULT_MIGRATIONS = new URL(
  "../../../database/migrations/",
  import.meta.url,
);

async function readMigrations(directory) {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (
    !names.length ||
    names.some((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) ||
    new Set(names.map((name) => name.slice(0, 4))).size !== names.length
  ) {
    throw new DatabaseCommandError(
      "Migrations need unique four-digit versions and lowercase SQL filenames",
    );
  }
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(new URL(name, directory), "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export async function migrateDatabase({
  databaseUrl,
  mode,
  directory = DEFAULT_MIGRATIONS,
}) {
  const database = assertIsolatedDevelopment(databaseUrl, mode);
  const migrations = await readMigrations(directory);
  const client = createClient(databaseUrl);
  try {
    await client.connect();
    // Recheck the actual server/database before issuing any DDL.
    const target = (
      await client.query(`
      SELECT current_database() AS name, host(inet_server_addr()) AS address
    `)
    ).rows[0];
    if (
      target.name !== database ||
      !["127.0.0.1", "::1"].includes(target.address)
    ) {
      throw new DatabaseCommandError(
        "Connected database does not match the isolated local target",
      );
    }
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL search_path = public, pg_catalog");
    await client.query("SELECT pg_advisory_xact_lock(7420839)");
    const ledger = (
      await client.query(
        "SELECT to_regclass('public.rio_schema_migrations') AS name",
      )
    ).rows[0].name;
    if (!ledger) {
      const objects = (
        await client.query(`
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        UNION ALL
        SELECT 1 FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        LIMIT 1
      `)
      ).rows;
      if (objects.length) {
        throw new DatabaseCommandError(
          "Untracked public schema is not empty; inspect it read-only. Automatic baseline adoption is disabled",
        );
      }
      await client.query(`
        CREATE TABLE public.rio_schema_migrations (
          name text PRIMARY KEY,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    const applied = (
      await client.query(
        "SELECT name, checksum FROM public.rio_schema_migrations ORDER BY name",
      )
    ).rows;
    for (let index = 0; index < applied.length; index += 1) {
      if (
        applied[index].name !== migrations[index]?.name ||
        applied[index].checksum !== migrations[index]?.checksum
      ) {
        throw new DatabaseCommandError(
          "Applied migration history differs from files. Restore immutable migration files; do not re-baseline",
        );
      }
    }
    const pending = migrations.slice(applied.length);
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO public.rio_schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
    }
    await client.query("COMMIT");
    return {
      applied: pending.map((migration) => migration.name),
      previouslyApplied: applied.length,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
