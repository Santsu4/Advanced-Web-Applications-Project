import { createClient } from "./connection.js";

export const APPLICATION_TABLES = [
  "bookings",
  "cities",
  "company_requests",
  "films",
  "invoices",
  "prices",
  "screenings",
  "screens",
  "seats",
  "tickets",
  "users",
];

export async function inspectDatabase(databaseUrl) {
  const client = createClient(databaseUrl);
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const tables = (
      await client.query(`
      SELECT tablename AS name FROM pg_catalog.pg_tables
      WHERE schemaname = 'public' ORDER BY tablename
    `)
    ).rows;
    const columns = (
      await client.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `)
    ).rows;
    const constraints = (
      await client.query(`
      SELECT c.relname AS table_name, con.conname AS name, con.contype AS type,
             pg_catalog.pg_get_constraintdef(con.oid) AS definition
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' ORDER BY c.relname, con.conname
    `)
    ).rows;
    const indexes = (
      await client.query(`
      SELECT tablename AS table_name, indexname AS name, indexdef AS definition
      FROM pg_catalog.pg_indexes WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `)
    ).rows;
    const triggers = (
      await client.query(`
      SELECT c.relname AS table_name, t.tgname AS name, t.tgenabled AS enabled,
             pg_catalog.pg_get_triggerdef(t.oid) AS definition
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY t.tgname
    `)
    ).rows;
    const functions = (
      await client.query(`
      SELECT p.proname AS name, pg_catalog.pg_get_functiondef(p.oid) AS definition
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname
    `)
    ).rows;
    const missingTables = APPLICATION_TABLES.filter(
      (name) => !tables.some((table) => table.name === name),
    );
    const rowCounts = {};
    for (const name of APPLICATION_TABLES) {
      if (!missingTables.includes(name)) {
        // Names come only from the fixed application table list above.
        rowCounts[name] = (
          await client.query(
            `SELECT count(*)::int AS count FROM public.${name}`,
          )
        ).rows[0].count;
      }
    }
    const settings = (
      await client.query(`
      SELECT current_setting('server_version') AS postgres_version,
             current_setting('TimeZone') AS session_timezone,
             current_setting('transaction_read_only') AS transaction_read_only
    `)
    ).rows[0];
    await client.query("COMMIT");
    return {
      ...settings,
      tables,
      missingTables,
      columns,
      constraints,
      indexes,
      triggers,
      functions,
      rowCounts,
    };
  } finally {
    // Disconnecting also rolls back an interrupted read-only transaction.
    await client.end();
  }
}
