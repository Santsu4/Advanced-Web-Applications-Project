import pg from "pg";

export class DatabaseCommandError extends Error {}

export function readDatabaseUrl(environment = process.env) {
  try {
    const url = new URL(environment.DATABASE_URL);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    ) {
      throw new Error();
    }
    return url.href;
  } catch {
    throw new DatabaseCommandError(
      "DATABASE_URL must be a PostgreSQL URL with a database name",
    );
  }
}

export function assertIsolatedDevelopment(databaseUrl, mode) {
  const url = new URL(readDatabaseUrl({ DATABASE_URL: databaseUrl }));
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    mode !== "isolated-development" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^rio_(dev|test)(_[a-z0-9_]+)?$/.test(database) ||
    url.search ||
    url.hash
  ) {
    throw new DatabaseCommandError(
      "Migration requires RIO_DATABASE_MODE=isolated-development, a loopback host, " +
        "a rio_dev or rio_test database (optional lowercase suffix), and no URL query/fragment",
    );
  }
  return database;
}

export function createClient(databaseUrl) {
  return new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
}

export function reportDatabaseError(error) {
  console.error(
    error instanceof DatabaseCommandError
      ? error.message
      : "Database command failed. Check connectivity, permissions and schema; connection details are omitted.",
  );
  process.exitCode = 1;
}
