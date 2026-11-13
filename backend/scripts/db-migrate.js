import "dotenv/config";
import { readDatabaseUrl, reportDatabaseError } from "./database/connection.js";
import { migrateDatabase } from "./database/migrate.js";

try {
  const result = await migrateDatabase({
    databaseUrl: readDatabaseUrl(),
    mode: process.env.RIO_DATABASE_MODE,
  });
  console.log(
    result.applied.length
      ? `Applied: ${result.applied.join(", ")}`
      : "Schema is up to date; no migrations applied",
  );
} catch (error) {
  reportDatabaseError(error);
}
