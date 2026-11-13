import pg from "pg";

export function createDatabasePool(config) {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  // Pool errors can contain connection details; keep logs independent of credentials.
  pool.on("error", () => console.error("An idle database connection failed"));
  return pool;
}
